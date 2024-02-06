// const { MongoClient } = require("mongodb");
import express, { Express, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

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


    app.get('/api/v1/users', async (req: Request, res: Response) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
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