const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 5000;
require('dotenv').config();

const app = express();


// middleware
app.use(cors());
app.use(express.json());


app.get('/',(req,res)=>{
    res.send('Do and earn server is running now!!');
})


app.listen(port,()=>{
    console.log(`The server is running on port no: ${port}`)
})