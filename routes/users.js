var User = require('../models/user');
var Task = require('../models/task');
var utils = require('./utils');

async function validatePendingTasks(pendingTaskIds) {
    if (!pendingTaskIds.length) {
        return [];
    }

    var tasks = await Task.find({ _id: { $in: pendingTaskIds } });
    if (tasks.length !== pendingTaskIds.length) {
        var error = new Error('One or more pending tasks do not exist');
        error.status = 400;
        throw error;
    }

    var completedTask = tasks.find(function (task) {
        return task.completed;
    });

    if (completedTask) {
        var completedError = new Error('Pending tasks must be incomplete');
        completedError.status = 400;
        throw completedError;
    }

    return tasks;
}

async function removeTasksFromUsers(tasks, currentUserId) {
    for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        if (task.assignedUser && task.assignedUser !== String(currentUserId)) {
            await User.findByIdAndUpdate(task.assignedUser, {
                $pull: { pendingTasks: task._id.toString() }
            });
        }
    }
}

module.exports = function (router) {
    var usersRoute = router.route('/users');

    usersRoute.get(async function (req, res) {
        try {
            var params = utils.parseQueryParameters(req);

            if (params.count) {
                var count = await User.countDocuments(params.where);
                return res.status(200).json({ message: 'OK', data: count });
            }

            var query = User.find(params.where);
            if (params.sort) {
                query = query.sort(params.sort);
            }
            if (params.select) {
                query = query.select(params.select);
            }
            if (params.skip !== undefined) {
                query = query.skip(params.skip);
            }
            if (params.limit !== undefined) {
                query = query.limit(params.limit);
            }

            var users = await query.exec();
            res.status(200).json({ message: 'OK', data: users });
        } catch (err) {
            utils.handleError(res, err);
        }
    });

    usersRoute.post(async function (req, res) {
        try {
            var name = req.body.name;
            var email = req.body.email;
            var pendingTasks = Array.isArray(req.body.pendingTasks) ? Array.from(new Set(req.body.pendingTasks.map(String))) : [];

            if (!name || !email) {
                var missingError = new Error('Name and email are required');
                missingError.status = 400;
                throw missingError;
            }

            var tasks = await validatePendingTasks(pendingTasks);

            var user = new User({
                name: name,
                email: email,
                pendingTasks: pendingTasks
            });

            try {
                await user.save();
            } catch (saveErr) {
                if (saveErr.code === 11000) {
                    saveErr = new Error('Email already exists');
                    saveErr.status = 400;
                }
                throw saveErr;
            }

            await removeTasksFromUsers(tasks, user._id);

            if (pendingTasks.length) {
                await Task.updateMany({
                    _id: { $in: pendingTasks }
                }, {
                    $set: {
                        assignedUser: user._id.toString(),
                        assignedUserName: user.name
                    }
                });
            }

            await Task.updateMany({
                assignedUser: user._id.toString()
            }, {
                $set: {
                    assignedUserName: user.name
                }
            });

            res.status(201).json({ message: 'User created', data: user });
        } catch (err) {
            if (err.name === 'CastError') {
                err.status = 400;
                err.message = 'Invalid task identifier';
            }
            utils.handleError(res, err);
        }
    });

    var userRoute = router.route('/users/:id');

    userRoute.get(async function (req, res) {
        try {
            var params = utils.parseQueryParameters(req);
            var query = User.findById(req.params.id);

            if (params.select) {
                query = query.select(params.select);
            }

            var user = await query.exec();
            if (!user) {
                return res.status(404).json({ message: 'User not found', data: [] });
            }

            res.status(200).json({ message: 'OK', data: user });
        } catch (err) {
            if (err.name === 'CastError') {
                err.status = 400;
                err.message = 'Invalid user identifier';
            }
            utils.handleError(res, err);
        }
    });

    userRoute.put(async function (req, res) {
        try {
            var user = await User.findById(req.params.id);

            if (!user) {
                return res.status(404).json({ message: 'User not found', data: [] });
            }

            var name = req.body.name;
            var email = req.body.email;
            var pendingTasks = Array.isArray(req.body.pendingTasks) ? Array.from(new Set(req.body.pendingTasks.map(String))) : [];

            if (!name || !email) {
                var missingError = new Error('Name and email are required');
                missingError.status = 400;
                throw missingError;
            }

            if (email !== user.email) {
                var existing = await User.findOne({ email: email, _id: { $ne: user._id } });
                if (existing) {
                    var duplicateError = new Error('Email already exists');
                    duplicateError.status = 400;
                    throw duplicateError;
                }
            }

            var tasks = await validatePendingTasks(pendingTasks);

            var oldPending = (user.pendingTasks || []).map(String);
            var toUnassign = oldPending.filter(function (taskId) {
                return pendingTasks.indexOf(taskId) === -1;
            });

            if (toUnassign.length) {
                await Task.updateMany({
                    _id: { $in: toUnassign }
                }, {
                    $set: {
                        assignedUser: '',
                        assignedUserName: 'unassigned'
                    }
                });
            }

            await removeTasksFromUsers(tasks, user._id);

            user.name = name;
            user.email = email;
            user.pendingTasks = pendingTasks;

            try {
                await user.save();
            } catch (saveErr) {
                if (saveErr.code === 11000) {
                    saveErr = new Error('Email already exists');
                    saveErr.status = 400;
                }
                throw saveErr;
            }

            if (pendingTasks.length) {
                await Task.updateMany({
                    _id: { $in: pendingTasks }
                }, {
                    $set: {
                        assignedUser: user._id.toString(),
                        assignedUserName: user.name
                    }
                });
            }

            await Task.updateMany({
                assignedUser: user._id.toString()
            }, {
                $set: {
                    assignedUserName: user.name
                }
            });

            res.status(200).json({ message: 'User updated', data: user });
        } catch (err) {
            if (err.name === 'CastError') {
                err.status = 400;
                err.message = 'Invalid identifier';
            }
            utils.handleError(res, err);
        }
    });

    userRoute.delete(async function (req, res) {
        try {
            var user = await User.findById(req.params.id);

            if (!user) {
                return res.status(404).json({ message: 'User not found', data: [] });
            }

            if ((user.pendingTasks || []).length) {
                await Task.updateMany({
                    _id: { $in: user.pendingTasks.map(String) }
                }, {
                    $set: {
                        assignedUser: '',
                        assignedUserName: 'unassigned'
                    }
                });
            }

            await Task.updateMany({
                assignedUser: user._id.toString()
            }, {
                $set: {
                    assignedUser: '',
                    assignedUserName: 'unassigned'
                }
            });

            await user.deleteOne();

            res.status(200).json({ message: 'User deleted', data: [] });
        } catch (err) {
            if (err.name === 'CastError') {
                err.status = 400;
                err.message = 'Invalid user identifier';
            }
            utils.handleError(res, err);
        }
    });

    return router;
};
