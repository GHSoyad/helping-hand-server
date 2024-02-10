// const { MongoClient } = require("mongodb");
import express, { Express, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

const app: Express = express();
app.use(cors());
app.use(express.json());
dotenv.config();

const port = process.env.PORT || 5000;
const client = new MongoClient(process.env.DB_URL || "");

async function run() {
  try {
    const database = client.db(process.env.DB_NAME || "");
    const usersCollection = database.collection('users');
    const categoriesCollection = database.collection('categories');
    const donationsCollection = database.collection('donations');

    app.get('/api/v1/users', async (req: Request, res: Response) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.status(200).send(users);
    });

    app.get('/api/v1/categories', async (req: Request, res: Response) => {
      const query = {};
      const categories = await categoriesCollection.find(query).toArray();
      res.status(200).send(categories);
    });

    app.get('/api/v1/donations', async (req: Request, res: Response) => {
      const searchText = req.query.searchText;
      const category = req.query.category;

      let query: any = {};
      if (searchText && category) {
        query = {
          $and: [
            { $or: [{ title: { $regex: searchText, $options: 'i' } }, { description: { $regex: searchText, $options: 'i' } }] },
            { category: new ObjectId(category as string) } // Convert category string to ObjectId
          ]
        };
      } else if (searchText) {
        query = {
          $or: [{ title: { $regex: searchText, $options: 'i' } }, { description: { $regex: searchText, $options: 'i' } }]
        };
      } else if (category) {
        query = { category: new ObjectId(category as string) }; // Convert category string to ObjectId
      }

      const donations = await donationsCollection.aggregate([
        { $match: query },
        {
          $lookup: {
            from: 'categories',
            localField: 'category',
            foreignField: '_id',
            as: 'category'
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'organizer',
            foreignField: '_id',
            as: 'organizer'
          }
        },
        { $unwind: '$category' },
        { $unwind: '$organizer' }
      ]).toArray();

      res.status(200).send(donations);
    })

  }
  finally { }
}
run().catch(console.dir);

app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to Helping Hand Server!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})