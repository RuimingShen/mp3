var Task = require('../models/task');
var User = require('../models/user');
var utils = require('./utils');

function parseDeadline(deadline) {
    if (deadline === undefined || deadline === null || deadline === '') {
        var missing = new Error('Deadline is required');
        missing.status = 400;
        throw missing;
    }

    var normalizedDeadline = deadline;

    if (typeof deadline === 'string') {
        var trimmed = deadline.trim();

        if (!trimmed) {
            var empty = new Error('Deadline is required');
            empty.status = 400;
            throw empty;
        }

        if (/^-?\d+$/.test(trimmed)) {
            normalizedDeadline = Number(trimmed);
        } else {
            normalizedDeadline = trimmed;
        }
    }

    if (typeof normalizedDeadline === 'number' && !isFinite(normalizedDeadline)) {
        var nonFinite = new Error('Deadline must be a valid date');
        nonFinite.status = 400;
        throw nonFinite;
    }

    var date = new Date(normalizedDeadline);
    if (isNaN(date.getTime())) {
        var invalid = new Error('Deadline must be a valid date');
        invalid.status = 400;
        throw invalid;
    }

    return date;
}

function parseBoolean(value, defaultValue) {
    if (value === undefined) {
        return defaultValue;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        var normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') {
            return true;
        }
        if (normalized === 'false' || normalized === '0') {
            return false;
        }
    }

    return Boolean(value);
}

async function updatePendingTasksForAssignment(taskId, oldUserId, newUserId, completed) {
    if (oldUserId && oldUserId !== newUserId) {
        await User.findByIdAndUpdate(oldUserId, { $pull: { pendingTasks: taskId } });
    }

    if (newUserId) {
        if (completed) {
            await User.findByIdAndUpdate(newUserId, { $pull: { pendingTasks: taskId } });
        } else {
            await User.findByIdAndUpdate(newUserId, { $addToSet: { pendingTasks: taskId } });
        }
    }
}

module.exports = function (router) {
    var tasksRoute = router.route('/tasks');

    tasksRoute.get(async function (req, res) {
        try {
            var params = utils.parseQueryParameters(req, { defaultLimit: 100 });

            if (params.count) {
                var count = await Task.countDocuments(params.where);
                return res.status(200).json({ message: 'OK', data: count });
            }

            var query = Task.find(params.where);
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

            var tasks = await query.exec();
            res.status(200).json({ message: 'OK', data: tasks });
        } catch (err) {
            utils.handleError(res, err);
        }
    });

    tasksRoute.post(async function (req, res) {
        try {
            var name = req.body.name;
            var deadline = parseDeadline(req.body.deadline);
            var description = req.body.description || '';
            var completed = parseBoolean(req.body.completed, false);
            var assignedUserId = req.body.assignedUser ? String(req.body.assignedUser) : '';
            var assignedUserName = 'unassigned';
            var assignedUser = null;

            if (!name) {
                var nameError = new Error('Name is required');
                nameError.status = 400;
                throw nameError;
            }

            if (assignedUserId) {
                assignedUser = await User.findById(assignedUserId);
                if (!assignedUser) {
                    var userError = new Error('Assigned user not found');
                    userError.status = 400;
                    throw userError;
                }
                assignedUserName = assignedUser.name;
            }

            var task = new Task({
                name: name,
                description: description,
                deadline: deadline,
                completed: completed,
                assignedUser: assignedUserId,
                assignedUserName: assignedUserName
            });

            await task.save();

            if (assignedUserId) {
                await updatePendingTasksForAssignment(task._id.toString(), null, assignedUserId, completed);
            }

            res.status(201).json({ message: 'Task created', data: task });
        } catch (err) {
            if (err.name === 'CastError') {
                err.status = 400;
                err.message = 'Invalid user identifier';
            }
            utils.handleError(res, err);
        }
    });

    var taskRoute = router.route('/tasks/:id');

    taskRoute.get(async function (req, res) {
        try {
            var params = utils.parseQueryParameters(req);
            var query = Task.findById(req.params.id);

            if (params.select) {
                query = query.select(params.select);
            }

            var task = await query.exec();
            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: [] });
            }

            res.status(200).json({ message: 'OK', data: task });
        } catch (err) {
            if (err.name === 'CastError') {
                err.status = 400;
                err.message = 'Invalid task identifier';
            }
            utils.handleError(res, err);
        }
    });

    taskRoute.put(async function (req, res) {
        try {
            var task = await Task.findById(req.params.id);

            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: [] });
            }

            var name = req.body.name;
            var deadline = parseDeadline(req.body.deadline);
            var description = req.body.description || '';
            var completed = parseBoolean(req.body.completed, false);
            var assignedUserId = req.body.assignedUser ? String(req.body.assignedUser) : '';
            var assignedUser = null;
            var assignedUserName = 'unassigned';

            if (!name) {
                var nameError = new Error('Name is required');
                nameError.status = 400;
                throw nameError;
            }

            if (assignedUserId) {
                assignedUser = await User.findById(assignedUserId);
                if (!assignedUser) {
                    var userError = new Error('Assigned user not found');
                    userError.status = 400;
                    throw userError;
                }
                assignedUserName = assignedUser.name;
            }

            var oldUserId = task.assignedUser || '';

            task.name = name;
            task.description = description;
            task.deadline = deadline;
            task.completed = completed;
            task.assignedUser = assignedUserId;
            task.assignedUserName = assignedUserName;

            await task.save();

            await updatePendingTasksForAssignment(task._id.toString(), oldUserId, assignedUserId, completed);

            res.status(200).json({ message: 'Task updated', data: task });
        } catch (err) {
            if (err.name === 'CastError') {
                err.status = 400;
                err.message = 'Invalid identifier';
            }
            utils.handleError(res, err);
        }
    });

    taskRoute.delete(async function (req, res) {
        try {
            var task = await Task.findById(req.params.id);

            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: [] });
            }

            var assignedUserId = task.assignedUser || '';

            await task.deleteOne();

            if (assignedUserId) {
                await User.findByIdAndUpdate(assignedUserId, { $pull: { pendingTasks: task._id.toString() } });
            }

            res.status(200).json({ message: 'Task deleted', data: [] });
        } catch (err) {
            if (err.name === 'CastError') {
                err.status = 400;
                err.message = 'Invalid task identifier';
            }
            utils.handleError(res, err);
        }
    });

    return router;
};
