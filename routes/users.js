var User = require('../models/user');
var Task = require('../models/task');
var utils = require('./utils');

function normalizePendingTasks(pendingTasks) {
    if (pendingTasks === undefined || pendingTasks === null) {
        return [];
    }

    if (!Array.isArray(pendingTasks)) {
        var typeError = new Error('Pending tasks must be an array of task identifiers');
        typeError.status = 400;
        throw typeError;
    }

    var normalized = pendingTasks.map(function (taskId) {
        if (taskId === null || taskId === undefined) {
            return '';
        }
        return String(taskId).trim();
    });

    var invalidTaskId = normalized.find(function (taskId) {
        return taskId === '';
    });

    if (invalidTaskId !== undefined) {
        var emptyError = new Error('Pending tasks must only contain valid task identifiers');
        emptyError.status = 400;
        throw emptyError;
    }

    return Array.from(new Set(normalized));
}

async function validatePendingTasks(pendingTaskIds, currentUserId) {
    if (!pendingTaskIds.length) {
        return [];
    }

    var tasks;
    try {
        tasks = await Task.find({ _id: { $in: pendingTaskIds } });
    } catch (err) {
        if (err.name === 'CastError') {
            err.status = 400;
            err.message = 'Invalid task identifier';
            err.status = 404;
            err.message = 'Task not found';
        }
        throw err;
    }
    if (tasks.length !== pendingTaskIds.length) {
        var error = new Error('One or more pending tasks were not found');
        error.status = 404;
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

    var currentUserIdString = currentUserId ? String(currentUserId) : null;

    var conflictingTask = tasks.find(function (task) {
        return task.assignedUser && task.assignedUser !== '' && task.assignedUser !== currentUserIdString;
    });

    if (conflictingTask) {
        var conflictError = new Error('Task is already assigned to another user');
        conflictError.status = 400;
        conflictError.status = 409;
        throw conflictError;
    }

    return tasks;
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
            var pendingTasks = normalizePendingTasks(req.body.pendingTasks);

            if (typeof name !== 'string' || !name.trim()) {
                var nameError = new Error('Name is required');
                nameError.status = 400;
                throw nameError;
            }

            if (typeof email !== 'string' || !email.trim()) {
                var emailError = new Error('Email is required');
                emailError.status = 400;
                throw emailError;
            }

            var trimmedName = name.trim();
            var trimmedEmail = email.trim();

            await validatePendingTasks(pendingTasks, null);

            var user = new User({
                name: trimmedName,
                email: trimmedEmail,
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

            if (pendingTasks.length) {
                await Task.updateMany({
                    _id: { $in: pendingTasks }
                }, {
                    $set: {
                        assignedUser: user._id.toString(),
                        assignedUserName: trimmedName
                    }
                });
            }

            await Task.updateMany({
                assignedUser: user._id.toString()
            }, {
                $set: {
                    assignedUserName: trimmedName
                }
            });

            res.status(201).json({ message: 'User created', data: user });
        } catch (err) {
            if (err.name === 'CastError') {
                err.status = 404;
                err.message = 'Task not found';
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
                err.status = 404;
                err.message = 'User not found';
                if (err.message === 'Task not found') {
                    err.status = 404;
                } else {
                    err.status = 404;
                    err.message = 'User not found';
                }
            }
            utils.handleError(res, err);
        }
    });

    userRoute.put(async function (req, res) {
        try {
            var user;
            try {
                user = await User.findById(req.params.id);
            } catch (lookupErr) {
                if (lookupErr.name === 'CastError') {
                    lookupErr.status = 404;
                    lookupErr.message = 'User not found';
                    lookupErr.status = 400;
                    lookupErr.message = 'Invalid user identifier';
                }
                throw lookupErr;
            }

            if (!user) {
                return res.status(404).json({ message: 'User not found', data: [] });
            }

            var name = req.body.name;
            var email = req.body.email;
            var pendingTasks = normalizePendingTasks(req.body.pendingTasks);

            if (typeof name !== 'string' || !name.trim()) {
                var missingName = new Error('Name is required');
                missingName.status = 400;
                throw missingName;
            }

            if (typeof email !== 'string' || !email.trim()) {
                var missingEmail = new Error('Email is required');
                missingEmail.status = 400;
                throw missingEmail;
            }

            var trimmedName = name.trim();
            var trimmedEmail = email.trim();

            if (trimmedEmail !== user.email) {
                var existing = await User.findOne({ email: trimmedEmail, _id: { $ne: user._id } });
                if (existing) {
                    var duplicateError = new Error('Email already exists');
                    duplicateError.status = 400;
                    throw duplicateError;
                }
            }

            await validatePendingTasks(pendingTasks, user._id);

            var oldPending = (user.pendingTasks || []).map(String);
            var toUnassign = oldPending.filter(function (taskId) {
                return pendingTasks.indexOf(taskId) === -1;
            });

            user.name = trimmedName;
            user.email = trimmedEmail;
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

            if (pendingTasks.length) {
                await Task.updateMany({
                    _id: { $in: pendingTasks }
                }, {
                    $set: {
                        assignedUser: user._id.toString(),
                        assignedUserName: trimmedName
                    }
                });
            }

            await Task.updateMany({
                assignedUser: user._id.toString()
            }, {
                $set: {
                    assignedUserName: trimmedName
                }
            });

            res.status(200).json({ message: 'User updated', data: user });
        } catch (err) {
            if (err.name === 'CastError') {
                if (err.message === 'Invalid task identifier') {
                    err.status = err.status || 400;
                } else {
                    err.status = 404;
                    err.message = 'User not found';
                }
                err.status = 404;
                err.message = 'User not found';
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
                err.status = 404;
                err.message = 'User not found';
            }
            utils.handleError(res, err);
        }
    });

    return router;
};
