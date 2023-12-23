const mysql = require('mysql');
const path = require('path');

// Connection Pool
let connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

exports.get_home = (req, res) => {
  const absolutePath  = path.resolve(__dirname, '../../pawhacks1.0/index.html');
  res.sendFile(absolutePath);
}

exports.post_home = (req, res) => {
  const absolutePath = path.resolve(__dirname, '../../pawhacks1.0/index.html');
  res.sendFile(absolutePath);
}

exports.view_login = (req, res) => {
  res.render('login')
}

exports.view_create_team = (req, res) => { 
  const google_id = req.user.google_id; // The logged-in user's Google ID

  // Find the team ID where the user is a member
  const queryFindTeam = `
    SELECT team_id 
    FROM team_members 
    WHERE member_google_id = ?
  `;

  connection.query(queryFindTeam, [google_id], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).send('Error retrieving user team');
    }

    // Check if the user is part of a team
    if (result.length !== 0) {
      const teamID = result[0].team_id; // Get the single team ID

      // Get the specific information of all the teammates from the users table
      const queryGetTeammates = `
        SELECT u.first_name, u.last_name, u.email, u.phone_number, u.university
        FROM users u
        INNER JOIN team_members tm ON u.google_id = tm.member_google_id
        WHERE tm.team_id = ?
      `;

      connection.query(queryGetTeammates, [teamID], (err, teammates) => {
        if (err) {
          console.log(err);
          return res.status(500).send('Error retrieving team members information');
        }

        // Send the teammates' information to the client
        res.render('create_team', {teammates:teammates});
      });
    } else { 
      res.render('create_team')
    } 

    
  });
};

exports.submit_create_team = (req, res) => { 
  const google_id = req.user.google_id; // Assuming the user ID is stored in req.user.google_id
  const { team_name, is_open } = req.body; 
  const is_open_boolean = is_open === "true" ? 1 : 0;

  // Check if the user already has a team
  const queryCheckTeam = `SELECT * FROM teams WHERE created_by_google_id = ?`;
  connection.query(queryCheckTeam, [google_id], (err, teams) => {
    if (err) {
      console.log(err);
      return res.status(500).send('Error checking for existing team');
    }

    if (teams.length > 0) {
      // User already has a team, so don't allow creating a new one
      return res.status(409).send('You already have a team and cannot create another one');
    }

    // No existing team found for the user, proceed with team creation
    connection.beginTransaction(err => {
      if (err) {
        console.log(err);
        return res.status(500).send('Error starting transaction');
      }

      // Insert the new team into the teams table
      const queryInsertTeam = ` 
        INSERT INTO teams (team_name, is_open, created_by_google_id)
        VALUES (?, ?, ?)
      `;
      connection.query(queryInsertTeam, [team_name, is_open_boolean, google_id], (err, result) => { 
        if (err) {
          console.log(err);
          // Rollback the transaction in case of error
          connection.rollback(() => {
            res.status(500).send('Error inserting team');
          });
          return;
        }

        // Get the team_id of the newly created team
        const team_id = result.insertId;

        // Insert the owner as the first team member
        const queryInsertOwner = `
          INSERT INTO team_members (team_id, member_google_id)
          VALUES (?, ?)
        `;
        connection.query(queryInsertOwner, [team_id, google_id], (err, result) => { 
          if (err) {
            console.log(err);
            // Rollback the transaction in case of error
            connection.rollback(() => {
              res.status(500).send('Error adding team owner to team members');
            });
            return;
          }

          // Commit the transaction if all operations were successful
          connection.commit(err => {
            if (err) {
              console.log(err);
              connection.rollback(() => {
                res.status(500).send('Error during transaction commit');
              });
              return;
            }

            // Team creation was successful
            res.redirect('/create_team');
          });
        });
      });
    });
  });
};

exports.add_team_members = (req, res) => { 
  const google_id = req.user.google_id; 
  const { add_team_members_email } = req.body; 
  const query = `
    INSERT INTO team_members (team_id, member_google_id)
    SELECT t.team_id, u.google_id
    FROM (SELECT team_id FROM teams WHERE created_by_google_id = ?) as t,
         (SELECT google_id FROM users WHERE email = ?) as u`;

  connection.query(query, [google_id, add_team_members_email], (err, result) => { 
    if (!err) { 
      if (result.affectedRows > 0) {
        res.send("Team member added successfully");
      } else {
        console.log(result)
        res.status(404).send("Team or user not found");
      }
    } else { 
      console.log(err);
      res.status(500).send("An error occurred while adding the team member");
    }
  });
};

// exports.post_register = (req, res) => {
//   const { first_name, last_name, email, username, password, phone_number, university } = req.body;
// 
//   // Break the query into multiple lines for better readability
//   let query = `
//     INSERT INTO users
//     SET 
//       first_name = ?, 
//       last_name = ?, 
//       email = ?, 
//       username = ?, 
//       password_hash = ?, 
//       phone_number = ?, 
//       university = ?
//   `;

//   // Execute the query
//   connection.query(query, [first_name, last_name, email, username, password, phone_number, university], (err, rows) => {
//     if (!err) {
//       res.render('home', { rows });
//     } else {
//       console.log(err);
//     }
//     console.log('The data from user table: \n', rows);
//   });
// };

exports.view_application = (req, res) => {
  if (req.isAuthenticated()) {
      // User is authenticated, render the application page
      res.render('application'); 
  } else {
      // User is not authenticated, redirect to the login page
      res.redirect('/login');
  }
}

exports.submit_application = (req, res) => { 
  const { university, phone_number, birthdate, have_id, hackathon_experience } = req.body; 
  const have_id_boolean = have_id === "true" ? 1:0;
  console.log(university, phone_number, birthdate, have_id_boolean, hackathon_experience)

  if(req.isAuthenticated()) { 
    const google_id = req.user.google_id; // Assuming the user ID is stored in req.user.id
    console.log(google_id)
    let query = ` 
      UPDATE users 
      SET 
        university = ?, 
        phone_number = ?, 
        birthdate = ?, 
        have_id = ?, 
        hackathon_experience = ?
      WHERE google_id = ?
    `;

    connection.query(query, [university, phone_number, birthdate, have_id_boolean, hackathon_experience, google_id], (err, result) => { 
      if (err) {
        // Handle the error, maybe log it and send a response to the client
        console.error("Error updating user data: ", err);
        res.status(500).send('Error updating your information');
      } else {
        // Handle a successful update, maybe send a success message to the client
        console.log("User data updated successfully");
        res.redirect('/create_team')
      }
    });
  } else {
    // User is not authenticated
    res.status(401).send('You need to log in to submit this form');
  }
}



// // View Users
// exports.view = (req, res) => {
//   // User the connection
//   connection.query('SELECT * FROM user WHERE status = "active"', (err, rows) => {
//     // When done with the connection, release it
//     if (!err) {
//       let removedUser = req.query.removed;
//       res.render('home', { rows, removedUser });
//     } else {
//       console.log(err);
//     }
//     console.log('The data from user table: \n', rows);
//   });
// }

// // Find User by Search
// exports.find = (req, res) => {
//   let searchTerm = req.body.search;
//   // User the connection
//   connection.query('SELECT * FROM user WHERE first_name LIKE ? OR last_name LIKE ?', ['%' + searchTerm + '%', '%' + searchTerm + '%'], (err, rows) => {
//     if (!err) {
//       res.render('home', { rows });
//     } else {
//       console.log(err);
//     }
//     console.log('The data from user table: \n', rows);
//   });
// }

// exports.form = (req, res) => {
//   res.render('add-user');
// }

// // Add new user
// exports.create = (req, res) => {
//   const { first_name, last_name, email, phone, comments } = req.body;
//   let searchTerm = req.body.search;

//   // User the connection
//   connection.query('INSERT INTO user SET first_name = ?, last_name = ?, email = ?, phone = ?, comments = ?', [first_name, last_name, email, phone, comments], (err, rows) => {
//     if (!err) {
//       res.render('add-user', { alert: 'User added successfully.' });
//     } else {
//       console.log(err);
//     }
//     console.log('The data from user table: \n', rows);
//   });
// }


// // Edit user
// exports.edit = (req, res) => {
//   // User the connection
//   connection.query('SELECT * FROM user WHERE id = ?', [req.params.id], (err, rows) => {
//     if (!err) {
//       res.render('edit-user', { rows });
//     } else {
//       console.log(err);
//     }
//     console.log('The data from user table: \n', rows);
//   });
// }


// // Update User
// exports.update = (req, res) => {
//   const { first_name, last_name, email, phone, comments } = req.body;
//   // User the connection
//   connection.query('UPDATE user SET first_name = ?, last_name = ?, email = ?, phone = ?, comments = ? WHERE id = ?', [first_name, last_name, email, phone, comments, req.params.id], (err, rows) => {

//     if (!err) {
//       // User the connection
//       connection.query('SELECT * FROM user WHERE id = ?', [req.params.id], (err, rows) => {
//         // When done with the connection, release it
        
//         if (!err) {
//           res.render('edit-user', { rows, alert: `${first_name} has been updated.` });
//         } else {
//           console.log(err);
//         }
//         console.log('The data from user table: \n', rows);
//       });
//     } else {
//       console.log(err);
//     }
//     console.log('The data from user table: \n', rows);
//   });
// }

// // Delete User
// exports.delete = (req, res) => {

//   // Delete a record

//   // User the connection
//   // connection.query('DELETE FROM user WHERE id = ?', [req.params.id], (err, rows) => {

//   //   if(!err) {
//   //     res.redirect('/');
//   //   } else {
//   //     console.log(err);
//   //   }
//   //   console.log('The data from user table: \n', rows);

//   // });

//   // Hide a record

//   connection.query('UPDATE user SET status = ? WHERE id = ?', ['removed', req.params.id], (err, rows) => {
//     if (!err) {
//       let removedUser = encodeURIComponent('User successeflly removed.');
//       res.redirect('/?removed=' + removedUser);
//     } else {
//       console.log(err);
//     }
//     console.log('The data from beer table are: \n', rows);
//   });

// }

// // View Users
// exports.viewall = (req, res) => {

//   // User the connection
//   connection.query('SELECT * FROM user WHERE id = ?', [req.params.id], (err, rows) => {
//     if (!err) {
//       res.render('view-user', { rows });
//     } else {
//       console.log(err);
//     }
//     console.log('The data from user table: \n', rows);
//   });

// }