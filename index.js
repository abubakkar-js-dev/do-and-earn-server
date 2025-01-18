const express = require("express");
require("dotenv").config();
const cors = require("cors");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");

const app = express();

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.y24v7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const tasksCollection = client.db("doAndearn").collection("tasks");
    const usersCollection = client.db("doAndearn").collection("users");

    // jwt and authentication related API
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET_KEY, {
        expiresIn: "1d",
      });
      res.send({ token });
    });

    // custom middleware

    const verifyToken = (req, res, next) => {
      const authHeader = req.headers.authorization;
      console.log(authHeader);
      if (!authHeader) {
        return res
          .status(401)
          .send({ message: "No token provided. Unauthorized access." });
      }

      const token = authHeader.split(" ")[1];
      console.log(token, "token from verify token");
      jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
        if (err) {
          return res
            .status(400)
            .send({ message: "Invalid token. Unauthorized access." });
        }
        req.decoded = decoded;
        console.log(decoded);
        next();
      });
    };

    // Role-based middleware (Admin, Worker, Buyer)
    const roleAuthorization = (requiredRole) => {
      return async (req, res, next) => {
        const email = req.decoded.email;
        console.log(email, "email from role auth");
        const user = await usersCollection.findOne({ email: email });

        if (!user) {
          return res
            .status(400)
            .send({ message: "Invalid user. Unauthorized access." });
        }

        if (user.role !== requiredRole) {
          return res.status(403).send({
            message: "Access forbidden. You do not have the required role.",
          });
        }
        next();
      };
    };

    // user related api
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);

      res.send(result);
    });

    // reduce buyer coin

    app.patch(
      "/users",
      verifyToken,
      roleAuthorization("buyer"),
      async (req, res) => {
        const updatedUser = req.body;
        const email = req.query.email;
        // console.log(email,"from patch user");
        if (req.decoded.email !== email) {
          return res
            .status(403)
            .send({ message: "You are not authorized to update this user." });
        }
        const filter = { email: email };
        const updatedDoc = {
          $set: {
            availableCoin: updatedUser.availableCoin,
          },
        };

        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await usersCollection.findOne(filter);
      res.send(result);
    });

    app.get("/best-workers", async (req, res) => {
      const filter = { role: "worker" };
      const cursor = usersCollection
        .find(filter)
        .sort({ availableCoin: -1 })
        .limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    // task related api

    app.post(
      "/tasks",
      verifyToken,
      roleAuthorization("buyer"),
      async (req, res) => {
        const newTask = req.body;
        const result = await tasksCollection.insertOne(newTask);
        res.send(result);
      }
    );

    app.get("/tasks", async (req, res) => {
      const result = await tasksCollection.find().toArray();
      res.send(result);
    });

    app.get(
      "/my-tasks/:email",
      verifyToken,
      roleAuthorization("buyer"),
      async (req, res) => {
        const email = req.params.email;
        if (req.decoded.email !== email) {
          return res
            .status(403)
            .send({ message: "Forbidden access. You can't access the tasks" });
        }
        const filter = { buyer_email: email };
        const result = await tasksCollection
          .find(filter)
          .sort({
            completion_date: -1
          })
          .toArray();

        res.send(result);
      }
    );

    app.get("/popular-tasks", async (req, res) => {
      const cursor = tasksCollection
        .find()
        .sort({ payable_amount: -1 })
        .limit(6);
      const result = await cursor.toArray();

      res.send(result);
    });

    app.patch('/tasks/:id',async(req,res)=>{
      const id = req.params.id;
      const updatedTask = req.body;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {
        $set:{
          task_title:updatedTask.task_title,
          task_detail:updatedTask.task_detail,
          submission_info:updatedTask.submission_info,
        }
      }

      const result = await tasksCollection.updateOne(filter,updatedDoc);
      res.send(result);
    })


  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Do and earn server is running now!!");
});

app.listen(port, () => {
  console.log(`The server is running on port no: ${port}`);
});
