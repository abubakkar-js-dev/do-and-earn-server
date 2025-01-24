const express = require("express");
require("dotenv").config();
const cors = require("cors");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");

const app = express();

// middleware
app.use(cors({
  origin: [
    'https://do-and-earn-9b707.web.app/',
    'http://localhost:5173/',
  ]
}));
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
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );

    const tasksCollection = client.db("doAndearn").collection("tasks");
    const usersCollection = client.db("doAndearn").collection("users");
    const paymentsCollection = client.db("doAndearn").collection("payments");
    const submissionCollection = client
      .db("doAndearn")
      .collection("submissions");
    const withdrawalCollection = client
      .db("doAndearn")
      .collection("withdrawals");

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
      // console.log(token, "token from verify token");
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
    const roleAuthorization = (requiredRole = []) => {
      return async (req, res, next) => {
        const email = req.decoded.email;
        // console.log(email, "email from role auth");
        const user = await usersCollection.findOne({ email: email });

        if (!user) {
          return res
            .status(400)
            .send({ message: "Invalid user. Unauthorized access." });
        }

        if (!requiredRole.includes(user.role)) {
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

    app.get(
      "/users",
      verifyToken,
      roleAuthorization(["admin"]),
      async (req, res) => {
        const result = await usersCollection.find().toArray();
        res.send(result);
      }
    );

    // update user coin

    app.patch(
      "/users",
      verifyToken,
      roleAuthorization(["buyer"]),
      async (req, res) => {
        const updatedUser = req.body;
        // console.log(updatedUser);
        const email = req.query.email;
        // console.log(email,"from patch user");
        // if (req.decoded.email !== email) {
        //   return res
        //     .status(403)
        //     .send({ message: "You are not authorized to update this user." });
        // }
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

    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await usersCollection.findOne(filter);
      res.send(result);
    });

    app.get("/users/role/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const role = user?.role;
      res.send({ role: role });
    });

    app.patch(
      "/users/:id/role",
      verifyToken,
      roleAuthorization(["admin"]),
      async (req, res) => {
        const id = req.params.id;
        const updatedRole = req.body;
        const filter = { _id: new ObjectId(id) };
        console.log(updatedRole);
        const updatedDoc = {
          $set: {
            role: updatedRole.role,
          },
        };

        const result = usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(filter);

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
      roleAuthorization(["buyer"]),
      async (req, res) => {
        const newTask = req.body;
        const result = await tasksCollection.insertOne(newTask);
        res.send(result);
      }
    );

    app.get(
      "/tasks",
      verifyToken,
      roleAuthorization(["worker", "admin"]),
      async (req, res) => {
        const filter = { required_workers: { $gt: 0 } };
        const result = await tasksCollection.find(filter).toArray();
        res.send(result);
      }
    );

    app.get(
      "/all-tasks",
      verifyToken,
      roleAuthorization(["admin"]),
      async (req, res) => {
        const result = await tasksCollection.find().toArray();
        res.send(result);
      }
    );

    app.get(
      "/tasks/:id",
      verifyToken,
      roleAuthorization(["worker"]),
      async (req, res) => {
        const id = req.params.id;
        console.log(id);
        const filter = { _id: new ObjectId(id) };
        const result = await tasksCollection.findOne(filter);

        res.send(result);
      }
    );

    app.get(
      "/my-tasks/:email",
      verifyToken,
      roleAuthorization(["buyer"]),
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
            completion_date: -1,
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

    app.patch(
      "/tasks/:id",
      verifyToken,
      roleAuthorization(["buyer"]),
      async (req, res) => {
        const id = req.params.id;
        const updatedTask = req.body;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            task_title: updatedTask.task_title,
            task_detail: updatedTask.task_detail,
            submission_info: updatedTask.submission_info,
          },
        };

        const result = await tasksCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.delete(
      "/tasks/:id",
      verifyToken,
      roleAuthorization(["buyer", "admin"]),
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const result = await tasksCollection.deleteOne(filter);
        res.send(result);
      }
    );

    // stripe payment intent
    app.post(
      "/create-payment-intent",
      verifyToken,
      roleAuthorization(["buyer"]),
      async (req, res) => {
        const { price } = req.body;
        const amount = parseFloat(price * 100);
        // console.log('Amount from payment intent', amount);
        try {
          const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: "usd",
            payment_method_types: ["card"],
          });

          res.send({
            clientSecret: paymentIntent.client_secret,
          });
        } catch (error) {
          console.error("Error creating payment intent:", error);
          res.status(500).send({ error: "Failed to create payment intent" });
        }
      }
    );

    // payment related api
    app.get(
      "/payments/:email",
      verifyToken,
      roleAuthorization(["buyer"]),
      async (req, res) => {
        const email = req.params.email;
        const filter = { email: email };
        const result = await paymentsCollection.find(filter).toArray();
        res.send(result);
      }
    );

    app.post(
      "/payments",
      verifyToken,
      roleAuthorization(["buyer"]),
      async (req, res) => {
        const payment = req.body;
        const result = await paymentsCollection.insertOne(payment);
        res.send(result);
      }
    );

    // submission related apis

    app.post(
      "/submissions",
      verifyToken,
      roleAuthorization(["worker"]),
      async (req, res) => {
        const newSubmission = req.body;
        const result = await submissionCollection.insertOne(newSubmission);

        res.send(result);
      }
    );

    app.get(
      "/submissions",
      verifyToken,
      roleAuthorization(["worker"]),
      async (req, res) => {
        const { email, page = 1, limit = 5 } = req.query;
        const skip = (page - 1) * limit;

        const query = { worker_email: email };
        const totalSubmissions = await submissionCollection.countDocuments(
          query
        );
        const submissions = await submissionCollection
          .find(query)
          .skip(parseInt(skip))
          .limit(parseInt(limit))
          .toArray();

        res.json({ submissions, totalSubmissions });
      }
    );

    app.get(
      "/submissions/approved",
      verifyToken,
      roleAuthorization(["worker"]),
      async (req, res) => {
        const email = req.query.email;
        const filter = { worker_email: email, status: "approved" };
        const result = await submissionCollection.find(filter).toArray();

        res.send(result);
      }
    );

    app.get(
      "/submissions/pending",
      verifyToken,
      roleAuthorization(["buyer"]),
      async (req, res) => {
        const email = req.query.email;
        const filter = { buyer_email: email, status: "pending" };
        const result = await submissionCollection.find(filter).toArray();
        res.send(result);
      }
    );

    app.patch("/submissions/:submissionId/approve", async (req, res) => {
      try {
        const { submissionId } = req.params;
        // console.log(submissionId);

        const submission = await submissionCollection.findOne({
          _id: new ObjectId(submissionId),
        });
        if (!submission)
          return res.status(404).json({ error: "Submission not found" });

        const task = await tasksCollection.findOne({
          _id: new ObjectId(submission.task_id),
        });
        if (!task) return res.status(404).json({ error: "Task not found" });

        // Update submission status
        await submissionCollection.updateOne(
          { _id: new ObjectId(submissionId) },
          { $set: { status: "approved" } }
        );

        // Update worker's availableCoin
        await usersCollection.updateOne(
          { email:submission.worker_email},
          { $inc: { availableCoin: task.payable_amount } }
        );

        res.send({success: true});
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.patch("/submissions/:submissionId/reject", async (req, res) => {
      try {
        const { submissionId } = req.params;


        const submission = await submissionCollection.findOne({
          _id: new ObjectId(submissionId),
        });
        if (!submission)
          return res.status(404).json({ error: "Submission not found" });

        // Update submission status
        await submissionCollection.updateOne(
          { _id: new ObjectId(submissionId) },
          { $set: { status: "rejected" } }
        );

        // Update task's required_workers
        await tasksCollection.updateOne(
          { _id: new ObjectId(submission.task_id) },
          { $inc: { required_workers: 1 } }
        );

        res.send({success: true});
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // withdrawals related api
    app.post(
      "/withdrawals",
      verifyToken,
      roleAuthorization(["worker"]),
      async (req, res) => {
        const newWithdrawal = req.body;
        const result = await withdrawalCollection.insertOne(newWithdrawal);
        res.send(result);
      }
    );

    app.get(
      "/withdrawals",
      verifyToken,
      roleAuthorization(["admin"]),
      async (req, res) => {
        const result = await withdrawalCollection
          .find({ status: "pending" })
          .toArray();
        res.send(result);
      }
    );

    // Update Withdrawal Status Route
    app.patch(
      "/withdrawals/:id",
      verifyToken,
      roleAuthorization(["admin"]),
      async (req, res) => {
        const withdrawalId = req.params.id;
        const { status, withdrawal_coin, worker_email } = req.body;
        // console.log(status);

        try {
          // Update withdrawal request status
          const updatedWithdrawal = await withdrawalCollection.updateOne(
            { _id: new ObjectId(withdrawalId) },
            { $set: { status } }
          );

          if (updatedWithdrawal.modifiedCount === 0) {
            return res
              .status(404)
              .send({ message: "Withdrawal request not found" });
          }

          // Decrease user coin balance
          const updatedUser = await usersCollection.updateOne(
            { email: worker_email },
            { $inc: { availableCoin: -withdrawal_coin } }
          );

          if (updatedUser.modifiedCount === 0) {
            return res.status(404).send({ message: "User not found" });
          }

          res.send({
            success: true,
          });
        } catch (error) {
          console.error("Error processing withdrawal:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );

    // States related api

    app.get(
      "/admin-stats",
      verifyToken,
      roleAuthorization(["admin"]),
      async (req, res) => {
        try {
          // First, aggregate stats from usersCollection
          const statsFromUsers = await usersCollection
            .aggregate([
              {
                $facet: {
                  // Count total workers
                  totalWorkers: [
                    { $match: { role: "worker" } },
                    { $count: "count" },
                  ],

                  // Count total buyers
                  totalBuyers: [
                    { $match: { role: "buyer" } },
                    { $count: "count" },
                  ],

                  // Sum of all available coins
                  totalAvailableCoin: [
                    {
                      $group: {
                        _id: null,
                        totalCoin: { $sum: "$availableCoin" },
                      },
                    },
                  ],
                },
              },
              {
                $project: {
                  totalWorkers: { $arrayElemAt: ["$totalWorkers.count", 0] },
                  totalBuyers: { $arrayElemAt: ["$totalBuyers.count", 0] },
                  totalAvailableCoin: {
                    $arrayElemAt: ["$totalAvailableCoin.totalCoin", 0],
                  },
                },
              },
            ])
            .toArray();

          // Second, aggregate total payments from paymentsCollection
          const statsFromPayments = await paymentsCollection
            .aggregate([
              {
                $group: {
                  _id: null,
                  totalPayments: { $sum: "$price" },
                },
              },
              {
                $project: {
                  _id: 0,
                  totalPayments: 1,
                },
              },
            ])
            .toArray();

          // Merge the two results
          const result = {
            ...statsFromUsers[0],
            // totalBuyers: 500,
            totalPayments: statsFromPayments[0]?.totalPayments || 0, // Fallback to 0 if no payments found
          };

          res.send(result);
        } catch (error) {
          console.error("Error fetching admin stats:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );

    app.get(
      "/worker-stats/:email",
      verifyToken,
      roleAuthorization(["worker"]),
      async (req, res) => {
        const email = req.params.email;
        try {
          // Totall submissions
          const totalSubmissions = await submissionCollection.countDocuments({
            worker_email: email,
          });

          // Total pending submissions
          const totalPendingSubmissions =
            await submissionCollection.countDocuments({
              worker_email: email,
              status: "pending",
            });

          // total Earnings
          const totalEarningsAggregate = await submissionCollection
            .aggregate([
              {
                $match: {
                  worker_email: email,
                  status: "approved",
                },
              },
              {
                $group: {
                  _id: null,
                  totalEarnings: { $sum: "$payable_amount" },
                },
              },
            ])
            .toArray();

          const totalEarnings =
            totalEarningsAggregate.length > 0
              ? totalEarningsAggregate[0].totalEarnings
              : 0;

          res.send({
            totalSubmissions,
            totalPendingSubmissions,
            totalEarnings,
          });
        } catch (error) {
          console.log(error, "Error fetching worker stats:");
        }
      }
    );

    app.get(
      "/buyer-stats/:email",
      verifyToken,
      roleAuthorization(["buyer"]),
      async (req, res) => {
        const email = req.params.email;

        const totalTasks = await tasksCollection.countDocuments({
          buyer_email: email,
        });

        const pendingTasks = await tasksCollection.countDocuments({
          buyer_email: email,
          required_workers: { $gt: 0 },
        });

        const totalPayments = await paymentsCollection
          .aggregate([
            {
              $match: {
                email: email,
              },
            },
            {
              $group: {
                _id: null,
                totalPayments: { $sum: "$price" },
              },
            },
          ])
          .toArray();

        res.send({
          totalTasks,
          pendingTasks,
          totalPayments:
            totalPayments.length > 0 ? totalPayments[0].totalPayments : 0,
        });
      }
    );
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
