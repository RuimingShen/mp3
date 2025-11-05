var mongoose = require('mongoose');

function scrubIdentifiers(doc, ret) {
    if (!ret) {
        return ret;
    }

    if (ret._id !== undefined) {
        ret.id = ret._id.toString();
        delete ret._id;
    }

    if (ret.__v !== undefined) {
        delete ret.__v;
    }

    return ret;
}

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
    toJSON: { transform: scrubIdentifiers },
    toObject: { transform: scrubIdentifiers }
});

module.exports = mongoose.model('Task', TaskSchema);
