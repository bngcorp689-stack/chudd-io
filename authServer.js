const express = require("express")
const mongoose = require("mongoose")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())

const SECRET = "supersecretkey"

mongoose.connect("PASTE_YOUR_MONGODB_LINK_HERE")

const UserSchema = new mongoose.Schema({
  username: String,
  password: String,
  totalScore: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  highestScore: { type: Number, default: 0 }
})

const User = mongoose.model("User", UserSchema)

app.post("/register", async (req,res)=>{

  const {username,password} = req.body

  const hashed = await bcrypt.hash(password,10)

  const user = new User({
    username,
    password: hashed
  })

  await user.save()

  res.json({message:"Account created"})
})

app.post("/login", async (req,res)=>{

  const {username,password} = req.body

  const user = await User.findOne({username})

  if(!user) return res.json({error:"User not found"})

  const valid = await bcrypt.compare(password,user.password)

  if(!valid) return res.json({error:"Wrong password"})

  const token = jwt.sign({id:user._id},SECRET)

  res.json({token})
})

app.listen(4000,()=>console.log("Auth server running on port 4000"))