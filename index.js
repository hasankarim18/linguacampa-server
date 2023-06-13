
/**
 *  Summer school server
 * 
 */

const express = require('express')
const cors    = require('cors')

require("dotenv").config();
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express()


const sk_key = process.env.sk_key; 

const stripe = require("stripe")(sk_key);



// middlewares 
app.use(cors())
app.use(express.json());


const port = process.env.PORT || 5000



/**
 * Mongodb
 */

const userName = process.env.USER_NAME;
const password = process.env.PASSWORD

const secret = process.env.secret_key;

/** verify jwt */

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if(!authorization){
    return res.status(401).send({error:true, message:"unathorized access"})
  }

  const token = authorization.split(' ')[1]

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
}

const uri =
  `mongodb+srv://${userName}:${password}@cluster0.nzfxe6e.mongodb.net/?retryWrites=true&w=majority`;

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
   // await client.connect();
     client.connect();

    const database = client.db("linguaCampa");
    const instructorCollection = database.collection("instructors");
    const usersCollections = database.collection("users");
    const classesCollections = database.collection("classes");
    const feedbackCollections = database.collection("feedback");
    const selectedCollections = database.collection("selected");
    const paymentsCollections = database.collection("payments");
    const enrollCollections = database.collection("enrolled");

    /**
     * ***********************************************************
     *       sending token to the front end
     *  **********************************************************
     *  */
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, secret, { expiresIn: "4h" });

      res.send({ token });
    });
    /**
     * ***********************************************************
     *     WARNING use veriryJWT before useing verifyAdmin
     * **********************************************************
     *  */
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollections.findOne(query);

      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message", data: [] });
      }
      next();
    };

    /**
     * ***********************************************************
     *   *  WHEN A USER LOGGED IN IT VERIFIES ITS ROLE AND GIVE ROLE RETURN
     * **********************************************************
     *  */

    /**
     * ************************************************
     *  VERIFY INSTRUCTOR WITH VALID JWT
     */
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollections.findOne(query);

      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message", data: [] });
      }
      next();
    };

    /**
     * ************************************************
     *  VERIFY STUDENT WITH VALID JWT
     */
    const verifyStudent = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollections.findOne(query);

      if (user?.role !== "student") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message", data: [] });
      }
      next();
    };

    /***Student related apis */
    app.post("/selectClass", verifyJWT, verifyStudent, async (req, res) => {
      try {
        const body = req.body;
        const classId = body.classId;
        const studentEmail = body.studenEmail;

        const isExistsQuery = {
          studentEmail: studentEmail,
          classId: classId,
        };

        const isEnrolled = await enrollCollections.findOne({
          studentId: studentEmail,
          enrolledClassIds: { $in: [classId] },
        });
        const isExists = await selectedCollections.findOne(isExistsQuery);

     

        if (isExists) {
          return res.send({ message: "already_selected" });
        } else {
          if (isEnrolled) {
            return res.send({ message: "already_enrolled" });
          } else {
            const date = new Date();
            const doc = {
              classId,
              studentEmail,
              date,
            };
            const result = await selectedCollections.insertOne(doc);
            res.send({ message: "success" });
          }
        }
      } catch (error) {
        res.send({ message: "error" });
      }
    });

    /** #deleteSelect class */

    app.delete(
      "/deleteSelectedClass",
      verifyJWT,
      verifyStudent,
      async (req, res) => {
        try {
          const classId = req.query.classId;
          const stEmail = req.query.email;

          const query = {
            $and: [
              { classId: classId },
              {
                studentEmail: stEmail,
              },
            ],
          };
          const result = await selectedCollections.deleteOne(query);

          res.send({ message: "success", data: result });
        } catch (error) {
          res.send({ message: "error" });
        }
      }
    );

    /** #student selected class */
    app.get(
      "/studentSelectedClass/:email",
      verifyJWT,
      verifyStudent,
      async (req, res) => {
        try {
          stEmail = req.params.email;
          const query = {
            studentEmail: stEmail,
          };

          const cursor = selectedCollections.find(query);

          const result = await cursor.toArray();

          //    const obId = result.map(item => item._id)

          const classIds = result.map((item) => item.classId);

          const query2 = {
            _id: { $in: classIds.map((id) => new ObjectId(id)) },
          };

          const result2 = await classesCollections.find(query2).toArray();
          // result2.selectedItemObjectId = obId;
        

          res.send({ message: "success", data: result2 });
        } catch (error) {
          res.send({ message: "error" });
        }
      }
    );

    app.get("/users/role/:email", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;

      const email = req.params.email;

      if (decodedEmail !== email) {
        return res.status(401).send({ admin: false });
      }

      const query = { email: email };

      const user = await usersCollections.findOne(query);
      const result = user?.role;
      // const result = { role: user?.role };
      res.send(result);
    });

    /**
     * Admin Only Get all user data
     */

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const cursor = usersCollections.find();
        const result = await cursor.toArray();
        res.send({ message: "success", data: result });
      } catch (error) {
        res.send({ message: "error", data: error });
      }
    });

    /**
     * Admin only update role
     */

    app.patch("/users", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const query = req.query;
       
        const email = query.email;
        const role = query.role;

        const filter = { email: email };

        const options = { upsert: true };
        // create a document that sets the plot of the movie
        const updateDoc = {
          $set: {
            role: role,
            applied: false,
          },
        };
        const result = await usersCollections.updateOne(
          filter,
          updateDoc,
          options
        );

        res.send({ message: "success", data: result });
      } catch (error) {
        res.send({ message: "error" });
      }
    });

    app.get("/classes", async (req, res) => {
      try {
        res.send({ message: "ok", data: "classes" });
      } catch (error) {
        res.send({ message: "failed", data: "data failed" });
      }
    });

    /**
     * instructor only add a class
     */

    app.post("/classes", verifyJWT, verifyInstructor, async (req, res) => {
      try {
        const data = req.body;
        data.enrolledStudents = 0;
        
        data.status = "pending";
        const result = await classesCollections.insertOne(data);
        res.send({ message: "success", data: result });
      } catch (error) {
        res.send({ message: "error", data: error });
      }
    });

    app.patch(
      "/updateInsturctor/:email",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        try {
          const body = req.body;   
          const email = req.params.email   
          const name = body.name 
          const photo = body.photo 
          const phone = body.phone
          const filter = { email: email };
           const options = { upsert: true };
           const updateDoc = {
             $set: {
               photo: photo,
               phone:phone,
               name:name
             },
           };
           const result = await usersCollections.updateOne(filter, updateDoc, options);

          res.send({ message: "success", data:result });
        } catch (error) {
          res.send({ message: "error" });
        }
      }
    );

    /** #allclassses admin only getting all classes */

    app.get("/allclasses/:email", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const adminEmail = req.params.email;
       
        const cursor = classesCollections.find();
        const result = await cursor.toArray();
        res.send({ message: "success", data: result });
      } catch (error) {
        res.send({ message: "error" });
      }
    });

    /** #all approved classes public url */

    app.get("/allClasses", async (req, res) => {
      try {
        const query = { status: "approved" };
        const cursor = classesCollections.find(query);
        const result = await cursor.toArray();
        res.send({ message: "success", data: result });
      } catch (error) {
        res.send({ message: "error" });
      }
    });

    /** #status admin only classes status change */
    app.post("/classes/status", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const info = req.body;
        const classId = info.classId;
        const status = info.status;

        const filter = { _id: new ObjectId(classId) };
        const updateDoc = {
          $set: {
            status: status,
          },
        };
        const options = { upsert: true };
        const result = await classesCollections.updateOne(
          filter,
          updateDoc,
          options
        );
        res.send({ message: "success", data: result });
      } catch (error) {
        res.send({ message: "error" });
      }
    });

    /** #feedback post feed back to instructor */

    app.post(
      "/instructor/feedback",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const body = req.body;
          const classId = req.body.classId;
          const instructorEmail = req.body.instructorEmail;
          const feedback = req.body.feedback;
          const doc = { classId, instructorEmail, feedback };
          const result = await feedbackCollections.insertOne(doc);
          res.send({ message: "success", data: result });
        } catch (error) {
          res.send({ message: "error" });
        }
      }
    );

   

    app.get(
      "/instructors/feedback/:email",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        try {
          const email = req.params.email;
          const query = { instructorEmail: email };
          const cursor = feedbackCollections.find(query);
          const feedbackResults = await cursor.toArray();

          // Fetch class information based on class ID and combine with feedback results
          const classIds = feedbackResults.map(
            (feedback) => new ObjectId(feedback.classId)
          );

          const classQuery = { _id: { $in: classIds } };
          const classCursor = classesCollections.find(classQuery);
          const classResults = await classCursor.toArray();
         

          // Create a mapping of class ID to class information
          const classMap = classResults.reduce((map, clazz) => {
            map[clazz._id.toString()] = clazz;
            return map;
          }, {});

          // Combine class information with feedback results
          const combinedResults = feedbackResults.map((feedback) => {
            const classInfo = classMap[feedback.classId.toString()];
            return {
              ...feedback,
              classInfo: classInfo ? classInfo : null,
            };
          });

         
          res.send({ message: "success", data: combinedResults });
        } catch (error) {
          console.error(error);
          res.send({ message: "error" });
        }
      }
    );

    /**
     * instructor only view class only own his class
     */

    /**************
     *
     * instructor home
     */

    app.get(
      "/instructorHome/:email",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        try {
            const email = req.params.email;          

            const result = await usersCollections.findOne({ email: email });
            res.send({message:"success", data:result});
        } catch (error) {
          res.send({message:'error', data:[]})
        }
      
      }
    );

    app.get("/classes/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { instructorEmail: email };
        const cursor = classesCollections.find(query);
        const result = await cursor.toArray();
        res.send({ message: "success", data: result });
      } catch (error) {
        res.send({ message: "error" });
      }
    });

    app.get("/instructor", verifyJWT, verifyInstructor, async (req, res) => {
      try {
        const cursor = instructorCollection.find();
        const result = await cursor.toArray();

        res.send({ message: "ok", data: result });
      } catch (error) {
        res.send({ message: "failed", data: "data failed" });
      }
    });
    /** save all signed up user data */
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "student";
      const userEmail = user.email;

      const query = { email: userEmail };

      const existingUser = await usersCollections.findOne(query);

      if (existingUser) {
        return res.send({ message: "user already exists" });
      } else {
        const result = await usersCollections.insertOne(user);
        res.send(result);
      }
    });

    /*** #create payment intent */

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    /**#paymentsCollections #paymentHistory */
    app.post("/payments", verifyJWT, verifyStudent, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentsCollections.insertOne(payment);

      const query = {
        studentEmail: payment.user,
      };

      const deleteResult = await selectedCollections.deleteMany(query);

      const existingStudent = await enrollCollections.findOne({
        studentId: payment.user,
      });

      if (existingStudent) {
       
        const updatedEnrolledClassIds = [
          ...existingStudent.enrolledClassIds,
          ...payment.enrolledClassIds,
        ];

        const updateResult = await enrollCollections.updateOne(
          { studentId: payment.user },
          { $set: { enrolledClassIds: updatedEnrolledClassIds } }
        );

        if (updateResult.modifiedCount > 0) {
          // The enrolledClassIds array has been updated successfully
          res.send({ insertResult, deleteResult, updateResult });
        } else {
          // Failed to update the enrolledClassIds array
          res.status(500).send("Failed to update enrolledClassIds array.");
        }
      } else {
        const enrolled = payment.enrolledClassIds;
        const studentEmail = payment.user;
        const enrolldoc = {
          enrolledClassIds: enrolled,
          studentId: studentEmail,
          date: new Date(),
        };
       

        const enrolledResult = await enrollCollections.insertOne(enrolldoc);
        res.send({ insertResult, deleteResult, enrolledResult });
      }
    });

    /** student payment history */

    app.get(
      "/paymentHistory/:email",
      verifyJWT,
      verifyStudent,
      async (req, res) => {
        const email = req.params.email;

        const payments = await paymentsCollections
          .find({ user: email })
          .sort({ date: -1 })
          .toArray();

        res.send({ message: "success", data: payments });
      }
    );

    /** enrolled classes */

    app.get(
      "/enrolledClasses/:email",
      verifyJWT,
      verifyStudent,
      async (req, res) => {
        try {
          const email = req.params.email;
          const isEnrolled = await enrollCollections.findOne({
            studentId: email,
          });

          if (isEnrolled) {
            const eid = isEnrolled.enrolledClassIds;
        
            const enrolledClasses = await classesCollections
              .find({ _id: { $in: eid.map((item) => new ObjectId(item)) } })
              .toArray();

            res.send({ message: "success", data: enrolledClasses });
          } else {
            res.send({ message: "not_enrolled", data: [] });
          }
        } catch (error) {
          res.send({ message: "errror", data: [] });
        }
      }
    );

    app.get("/updateSeats", async (req, res) => {
      try {
        const enrolledStudents = await enrollCollections.find().toArray();
        const classes = await classesCollections
          .find({ status: "approved" })
          .toArray();

        for (const classObj of classes) {
          const classId = classObj._id;
          const enrolledCount = enrolledStudents.filter((student) =>
            student.enrolledClassIds.includes(classId)
          ).length;
          const seatsLeft = classObj.seats - enrolledCount;

        

          // await classesCollections.updateOne(
          //   { _id: classId },
          //   { $set: { enrolledStudents: enrolledCount, seatsLeft: seatsLeft } }
          // );
        }

        res.send("Seats updated successfully");
      } catch (error) {
        console.error(error);
        res.status(500).send("Error updating seats");
      }
    });

    /***** API OPEN TO ALL */

    app.get('/popularClasses', async (req, res)=> {
      try {
        const result = await classesCollections
          .find()
          .sort({ enrolledStudents: -1 })
          .limit(6).toArray()
        res.send({message:"success", data:result})
      } catch (error) {
        res.send({message:'error', data:[]})
      }
    } )
    /** #popular */
    app.get('/popularInstructors', async (req, res)=> {
      try {  
        const query = {role:'instructor'}
       const instructList = await usersCollections.find(query).toArray();
       //const 
       const classes = await classesCollections.find().toArray()
        const instructorEmails = instructList.map(
          (instructor) => { 
            return instructor.email
            }
        );

        const combinedArray = instructorEmails.map((email) => {
          return {
            email: email,
            classList: classes.filter((cls) => cls.instructorEmail === email),
          };
        });

        const popularInsArray = combinedArray.map((instructor) => {
          const totalEnrolledStudents = instructor.classList.reduce(
            (sum, cls) => sum + cls.enrolledStudents,
            0
          );
          return {
            email: instructor.email,
            totalEnrolledStudents: totalEnrolledStudents,
          };
        });

        const sortedInstructorArray = popularInsArray.sort(
          (a, b) => b.totalEnrolledStudents - a.totalEnrolledStudents
        );

    const updatedInstructors = [];

      // Iterate over sortedEnrolledStudentsArray using for...of loop
      for (const instructor of sortedInstructorArray) {
        const user = await usersCollections.findOne({
          email: instructor.email,
        });

        if (user) {
          // Create a new object with the combined information from enrollment and user
          const updatedEnrollment = {
            email: instructor.email,
            totalEnrolledStudents: instructor.totalEnrolledStudents,
            info: user,
          };

          updatedInstructors.push(updatedEnrollment);
        }
      }

     res.send({
       message: "success",
       data: updatedInstructors,
       com: combinedArray,
     });

      } catch (error) {
        res.send({message:"error"})
      }
       
    })

    /** update Class seats */

    app.post('/updateClassSeats',verifyJWT, verifyStudent, async (req, res)=> {
        try {
            const body = req.body
         
              cid = body.map(id => new ObjectId(id))
        // const classes = await classesCollections
          //   .find({ _id: { $in: body.map((id) => new ObjectId(id)) } })
          //  .toArray();
            
          //  for (const cls of classes) {
          //    const updatedEnrolledStudents = cls.enrolledStudents + 1;
          //    await classesCollections.updateOne(
          //      { _id: cls._id },
          //      { $set: { enrolledStudents: updatedEnrolledStudents } }
          //    );
          //  }
            
        const result = await classesCollections.updateMany(
          { _id: { $in: cid } },
          { $inc: { enrolledStudents: 1 } }
        );

      
          res.send({message:"success", data:result})
        } catch (error) {
            res.send({ message: "error" });
        }

    } )



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  //  await client.close();
  }
}
run().catch(console.dir);




/** 
 * Mongodb
 */


app.get('/', (req, res)=> {
    res.send('LinguaCampa')
} )

app.listen(port, ()=> {
    console.log('LinguaCampa server')
})





