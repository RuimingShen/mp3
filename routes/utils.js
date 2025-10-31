function parseJSONParameter(value, paramName) {
    if (value === undefined) {
        return undefined;
    }

    try {
        return JSON.parse(value);
    } catch (err) {
        var error = new Error('Invalid JSON in ' + paramName + ' parameter');
        error.status = 400;
        throw error;
    }
}

function parseNumberParameter(value, paramName) {
    if (value === undefined) {
        return undefined;
    }

    var numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue < 0 || !Number.isInteger(numberValue)) {
        var error = new Error('Invalid value for ' + paramName + ' parameter');
        error.status = 400;
        throw error;
    }
    return numberValue;
}

function parseQueryParameters(req, options) {
    options = options || {};

    var where = parseJSONParameter(req.query.where, 'where') || {};
    var sort = parseJSONParameter(req.query.sort, 'sort');
    var select = parseJSONParameter(req.query.select, 'select');
    var skip = parseNumberParameter(req.query.skip, 'skip');
    var limit = parseNumberParameter(req.query.limit, 'limit');
    var count = false;

    if (req.query.count !== undefined) {
        count = String(req.query.count).toLowerCase() === 'true';
    }

    if (limit === undefined && options.defaultLimit !== undefined) {
        limit = options.defaultLimit;
    }

    return {
        where: where,
        sort: sort,
        select: select,
        skip: skip,
        limit: limit,
        count: count
    };
}

function handleError(res, err) {
    var status = err.status || 500;
    res.status(status).json({
        message: err.message || 'Server Error',
        data: []
    });
}

module.exports = {
    parseQueryParameters: parseQueryParameters,
    handleError: handleError
};
