app.controller("Admin", [ "$http", "globals",
    function($http, globals) {
        var ctrl = this;

        // creation form
        ctrl.newLogin = '';
        ctrl.newPassword = '';
        ctrl.startBalance = 0;
        ctrl.newLimit = 0;
        ctrl.newRole = '';
        ctrl.result = '';

        ctrl.allUsers = '';
        ctrl.map = new Map()

        // edit form
        ctrl.edit_newLogin = '';
        ctrl.edit_newPassword = '';
        ctrl.edit_startBalance = 0;
        ctrl.edit_newLimit = 0;
        ctrl.edit_newRole = '';


        ctrl.editedUser = null

        function clear() {
            ctrl.newLogin = '';
            ctrl.newPassword = '';
            ctrl.startBalance = 0;
            ctrl.newLimit = 0;
            ctrl.newRole = '';
        }

        ctrl.clearResult = function() {
            ctrl.result = ''
        }

        ctrl.refreshUsers = function() {
            console.log("getting all users")
            $http.get('/allusers').then(
                function (rep) {
                    debugger;
                    ctrl.allUsers = rep.data

                    ctrl.map = new Map()

                    for (var i = 0; i < ctrl.allUsers.length; i ++) {
                        ctrl.map.set(ctrl.allUsers[i]._id, ctrl.allUsers[i])
                    }

                    console.log(ctrl.allUsers)
                    console.log(ctrl.map)
                }
            )
        }

        function fillEditForm(user) {
            ctrl.edit_newLogin = user.login;
            ctrl.edit_newPassword = user.password;
            ctrl.edit_startBalance = user.balance;
            ctrl.edit_newLimit = user.limit;
            ctrl.edit_newRole = user.role;
        }

        function clearEditForm() {
            ctrl.edit_newLogin = ''
            ctrl.edit_newPassword = '';
            ctrl.edit_startBalance = '0';
            ctrl.edit_newLimit = 0;
            ctrl.edit_newRole = '';

            ctrl.editedUser = null
        }

        ctrl.setEditedUser = function(userId) {
            debugger;
            ctrl.editedUser = ctrl.map.get(userId)
            fillEditForm(ctrl.editedUser)

            $("#editUserPopup").modal();
        }

        ctrl.editAccount = function() {
            debugger;
            var userToUpdate = {}
            userToUpdate.login = ctrl.edit_newLogin
            userToUpdate.password = ctrl.edit_newPassword
            userToUpdate.balance = ctrl.edit_startBalance
            userToUpdate.limit = ctrl.edit_newLimit
            userToUpdate.role = ctrl.edit_newRole

            $http.post('/editUser', userToUpdate).then(
                function(rep) {
                    debugger;
                    if (rep.data.code == "success") {
                        ctrl.refreshUsers();
                        ctrl.result = 'Updated'
                        $("#editUserPopup").modal('hide');
                        $("#newUserModal").modal();
                        clearEditForm();
                        console.log("User updated.")
                    } else {
                        ctrl.result = "Not updated. Wrong data provided."
                        $("#newUserModal").modal();
                    }

                },

                function(err) {
                    ctrl.result = "Not updated. Wrong data provided."
                    $("#newUserModal").modal();
                    console.log("Error during updating")
                }
            )
        }

        ctrl.createNewAccount = function () {
            console.log("create new account method called")
            $http.post('/newAccount' ,
                {
                    login: ctrl.newLogin,
                    password: ctrl.newPassword,
                    balance: ctrl.startBalance,
                    limit: ctrl.newLimit,
                    role: ctrl.newRole
                }
            ).then(
                // when rep exist
                function (rep) {
                    console.log("asdasffsds")
                    debugger;
                    if (rep.data.code === "created") {
                        clear()
                        ctrl.result = "User created."
                        $("#newUserModal").modal();

                        ctrl.refreshUsers()
                    } else {
                        ctrl.result = "User with this login already exist."
                        $("#newUserModal").modal();
                    }
                },
                // when err exist
                function (err) {
                    ctrl.result = "Server error occurred. Cannot create new user."
                    $("#newUserModal").modal();
                }).finally(function () {ctrl.clear()})
        }

        ctrl.refreshUsers()
    }
]);