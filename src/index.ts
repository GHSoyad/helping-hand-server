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

    app.post('/api/v1/auth/register', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const userExists = await usersCollection.findOne(query);
      if (userExists) {
        res.status(409).send({ message: 'Already Registered with this Email!' })
        return;
      }

      const result = await usersCollection.insertOne({ ...user, role: "user" });
      if (result.acknowledged) {
        const insertedUser = await usersCollection.findOne({ _id: result.insertedId });
        res.status(200).send({ message: 'Registered successfully', content: insertedUser, success: true });
      } else {
        res.status(409).send({ message: 'Failed to register user', success: false });
      }
    });

    app.post('/api/v1/auth/login', async (req, res) => {
      const payload = req.body;
      const query = { email: payload.email };
      const user = await usersCollection.findOne(query);

      if (!user) {
        res.status(409).send({ message: 'User not found!' })
        return;
      }
      if (user.password !== payload.password) {
        res.status(409).send({ message: 'Password is wrong!' })
        return;
      }

      // Construct a new object with selected fields
      const { name, email, role } = user;
      const responseUser = { name, email, role };

      res.status(200).send({ message: 'Logged in successfully', success: true, content: responseUser });
    })

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

    app.get('/api/v1/donation/:id', async (req: Request, res: Response) => {
      const donationId = req.params.id;
      try {
        const query = { _id: new ObjectId(donationId) };
        const donation = await donationsCollection.aggregate([
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
          { $unwind: '$organizer' },
          { $limit: 1 } // Limit the results to one document
        ]).toArray();

        res.status(200).send(donation[0]);
      }
      catch (error) {
        res.status(500).send('Internal Server Error');
      }
    });

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