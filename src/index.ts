// const { MongoClient } = require("mongodb");
import express, { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, PushOperator } from "mongodb";
import jwt from "jsonwebtoken";
import bcrypt from 'bcrypt';

const app: Express = express();
app.use(cors());
app.use(express.json());
dotenv.config();

const port = process.env.PORT || 5000;
const client = new MongoClient(process.env.DB_URL || "");


const verifyJWT = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'Unauthorized User' })
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET as string, function (err, user) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden Access' })
    }
    (req as any).user = user;
    next()
  })
}

async function run() {
  try {
    const database = client.db(process.env.DB_NAME || "");
    const usersCollection = database.collection('users');
    const categoriesCollection = database.collection('categories');
    const donationsCollection = database.collection('donations');
    const paymentsCollection = database.collection('payments');

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
        res.status(409).send({ message: 'Already Registered with this Email!', success: false })
        return;
      }

      const hashedPassword = await bcrypt.hash(user.password, Number(process.env.BCRYPT_SALT_ROUNDS));
      const result = await usersCollection.insertOne({ ...user, password: hashedPassword, role: "user" });

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
        res.status(409).send({ message: 'User not found!', success: false })
        return;
      }
      const isPasswordMatched = await bcrypt.compare(payload.password, user.password);
      if (!isPasswordMatched) {
        res.status(409).send({ message: 'Password is wrong!', success: false })
        return;
      }

      const { _id, name, email, role } = user;
      const token = jwt.sign({ email }, process.env.JWT_SECRET as string, { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN });
      const responseUser = { _id, name, email, role, token };

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

    app.get('/api/v1/donations/:userId', async (req: Request, res: Response) => {
      const userId = req.params.userId;

      try {
        const query = { organizer: new ObjectId(userId) };

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
      }
      catch (error) {
        res.status(500).send('Internal Server Error');
      }
    })

    app.post('/api/v1/donation', verifyJWT, async (req, res) => {
      const donation = req.body;
      try {
        const insertDonation = {
          ...donation,
          organizer: ObjectId.createFromHexString(donation?.organizer),
          category: ObjectId.createFromHexString(donation?.category),
        }

        const result = await donationsCollection.insertOne(insertDonation);
        res.status(200).send({ message: 'Donation added successfully!', success: true, content: result });
      }
      catch (error) {
        res.status(500).send('Internal Server Error!');
      }
    })

    app.patch('/api/v1/donation/:id', verifyJWT, async (req, res) => {
      const donation = req.body.data;
      const id = req.params.id;
      try {
        const filter = { _id: new ObjectId(id) };
        console.log(donation)
        const updateDonation = {
          $set: {
            title: donation.title,
            description: donation.description,
            goal: donation.goal,
            picture: donation.picture,
            category: ObjectId.createFromHexString(donation?.category),
            startDate: donation.startDate,
            endDate: donation.endDate,
            location: donation.location,
          }
        }
        const result = await donationsCollection.updateOne(filter, updateDonation);
        res.status(200).send({ message: 'Donation updated successfully!', success: true, content: result });
      }
      catch (error) {
        res.status(500).send('Internal Server Error!');
      }
    })

    app.delete('/donation/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationsCollection.deleteOne(query);
      res.status(200).send({ message: 'Donation deleted successfully!', success: true, content: result });
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

    app.post('/api/v1/donation/payment/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const donation = req.body;

      try {
        const insertDonation = {
          ...donation,
          payerId: ObjectId.createFromHexString(donation?.payerId),
          donationId: ObjectId.createFromHexString(id),
          createdAt: new Date(),
        };

        const filter = { _id: new ObjectId(id) };

        // Update the previous document
        const updateDonation = {
          $inc: { raised: parseInt(donation.amount) }, // Increment the value of 'raised' by 100
          $push: { payments: { $each: [] } } // Ensure 'payments' exists as an array
        };
        // Update the previous document
        const update = await donationsCollection.updateOne(filter, updateDonation);

        if (update.modifiedCount === 1) {
          // If the update was successful, insert the new donation document
          const create = await paymentsCollection.insertOne(insertDonation);
          const newDocumentId = create.insertedId; // Get the ID of the newly inserted document

          const updatedDonationAgain = await donationsCollection.findOneAndUpdate(
            filter,
            {
              $push: { payments: newDocumentId } as PushOperator<Document>
            }
          );

          res.status(200).send({ message: 'Thank You! Donated successfully!', success: true, content: { ...create, ...updatedDonationAgain } });
        } else {
          // If the update didn't affect any document (perhaps due to wrong ID), send an appropriate error response
          res.status(404).send({ message: 'Donation not found!', success: false });
        }
      }
      catch (error) {
        res.status(500).send('Internal Server Error!');
      }
    })

    app.get('/api/v1/statistics/user-total-donation/:id', verifyJWT, async (req: Request, res: Response) => {
      const userId = req.params.id;

      try {
        const totalDonationResult = await paymentsCollection.aggregate([
          {
            $group: {
              _id: null, // Group by all documents
              totalDonation: { $sum: "$amount" } // Compute sum of 'amount' field for all documents
            }
          }
        ]).toArray();

        const userTotalDonationResult = await paymentsCollection.aggregate([
          {
            $match: {
              payerId: ObjectId.createFromHexString(userId) // Match documents with specified payerId
            }
          },
          {
            $group: {
              _id: null, // Group by all matched documents
              userTotalDonation: { $sum: "$amount" } // Compute sum of 'amount' field for matched documents
            }
          }
        ]).toArray();

        // Extract the computed values from the aggregation results
        const totalDonation = totalDonationResult.length > 0 ? totalDonationResult[0].totalDonation : 0;
        const userTotalDonation = userTotalDonationResult.length > 0 ? userTotalDonationResult[0].userTotalDonation : 0;

        res.status(200).json({
          message: 'Donation data found.', success: true, content: {
            totalDonation,
            userTotalDonation
          }
        });
      } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get('/api/v1/statistics/get-last-seven-days', async (req: Request, res: Response) => {
      try {
        // Calculate the date 7 days ago
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const result = await paymentsCollection.aggregate([
          {
            $match: {
              createdAt: { $gte: sevenDaysAgo } // Filter documents created in the last 7 days
            }
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, // Group by day
              totalAmount: { $sum: "$amount" } // Compute sum of 'amount' field for each day
            }
          },
          {
            $sort: { _id: 1 } // Sort by date in ascending order
          }
        ]).toArray();

        res.status(200).json({ message: 'Donation data found.', success: true, content: result });
      } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
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