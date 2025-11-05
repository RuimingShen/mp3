var mongoose = require('mongoose');

var TaskSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    deadline: {
        type: Date,
        required: true
    },
    completed: {
        type: Boolean,
        default: false
    },
    assignedUser: {
        type: String,
        default: ''
    },
    assignedUserName: {
        type: String,
        default: 'unassigned'
    },
    dateCreated: {
        type: Date,
        default: Date.now
    }
}, {
    versionKey: false,
    id: false
});

TaskSchema.set('toJSON', {
    transform: function (doc, ret) {
        delete ret._id;
        return ret;
    }
});

TaskSchema.set('toObject', {
    transform: function (doc, ret) {
        delete ret._id;
        return ret;
    }
});

module.exports = mongoose.model('Task', TaskSchema);
