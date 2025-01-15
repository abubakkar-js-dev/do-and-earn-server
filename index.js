const express = require('express');
require('dotenv').config();
const cors = require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');

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
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const tasksCollection = client.db('doAndearn').collection('tasks');
    const usersCollection = client.db('doAndearn').collection('users');

    // jwt and authentication related API
    app.post('/jwt',(req,res)=>{
      const user = req.body;
      const token =  jwt.sign(user,process.env.JWT_SECRET_KEY,{
        expiresIn: '1d'
      })
      res.send({token})
    })
    
    
    // user related api
    app.post('/users',async(req,res)=>{
      const user = req.body;
      const result = await usersCollection.insertOne(user);

      res.send(result);
    })

    app.get('/best-workers',async(req,res)=>{
      const filter = {role: 'worker'};
      const cursor = usersCollection.find(filter).sort({availableCoin: -1}).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    })

    // task related api
    app.get('/tasks',async(req,res)=>{
        const result =  await tasksCollection.find().toArray();
        res.send(result);
    })


  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);





app.get('/',(req,res)=>{
    res.send('Do and earn server is running now!!');
})


app.listen(port,()=>{
    console.log(`The server is running on port no: ${port}`)
})