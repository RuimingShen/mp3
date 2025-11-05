// Load required packages
var mongoose = require('mongoose');

// Define our user schema
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

var UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    pendingTasks: [
        {
            type: String,
            ref: 'Task'
        }
    ],
    dateCreated: {
        type: Date,
        default: Date.now
    }
}, {
    versionKey: false,
    toJSON: { transform: scrubIdentifiers },
    toObject: { transform: scrubIdentifiers }
});

// Export the Mongoose model
module.exports = mongoose.model('User', UserSchema);
