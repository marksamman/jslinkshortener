var express = require('express');
var pg = require('pg');
var redis = require("redis");

var app = express();
var pgClient = new pg.Client(process.env.DATABASE_URL || 'postgresql://mark@localhost/linkshortener');
var redisClient = redis.createClient();

// Constants
var url_safe = ['2', 'f', 'D', '4', 'I', 'o', 'a', 'X', 'p', 'g', 'e', '9', 'i', '0', 'x', 'O', 'H', 'W', 's', 'h', 'Q', 'r', 'k', 'y', 'Z', 'c', '6', 'b', 'Y', 'S', 'J', 'M', 'E', 'G', 'l', '-', 'T', 'B', 'V', 'F', 'K', 'v', 'n', 'A', '_', 'U', 't', 'j', 'w', '1', 'd', 'N', 'm', 'u', 'C', 'R', '3', 'L', 'q', '8', 'z', 'P', '5', '7'];
var decode_array = [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 35, -1, -1, 13, 49, 0, 56, 3, 62, 26, 63, 59, 11, -1, -1, -1, -1, -1, -1, -1, 43, 37, 54, 2, 32, 39, 33, 16, 4, 30, 40, 57, 31, 51, 15, 61, 20, 55, 29, 36, 45, 38, 17, 7, 28, 24, -1, -1, -1, -1, 44, -1, 6, 27, 25, 50, 10, 1, 9, 19, 12, 47, 22, 34, 52, 42, 5, 8, 58, 21, 18, 46, 53, 41, 48, 14, 23, 60];

pgClient.connect(function(err) {
    if (err) {
        return console.error('could not connect to database', err);
    }
});

function encode_int(i) {
    if (i === 0) {
        return '';
    }
    return encode_int(i >> 6) + url_safe[i & 63];
}

function decode_int(v) {
    var res = 0;
    var mult = 1;
    for (i = v.length; --i >= 0;) {
        var idx = v.charCodeAt(i);
        if (idx >= decode_array.length) {
            return 0;
        }

        var val = decode_array[idx];
        if (val === -1) {
            return 0;
        }

        res += val * mult;
        mult <<= 6;
    }
    return res;
}

app.get('/:link_id', function(req, res) {
    var link_id = req.params.link_id;
    redisClient.get(link_id, function(err, reply) {
        if (reply !== null) {
            res.redirect(reply);
            redisClient.expire(link_id, 10);
            return;
        }

        if (link_id.length < 3) {
            res.send(404);
            return;
        }

        var id = decode_int(link_id.slice(0, -2));
        if (id === 0) {
            res.send(404);
            return;
        }

        pgClient.query('SELECT url, random FROM links WHERE id = ' + id, function(err, result) {
            if (err) {
                res.send(500);
                return;
            }

            if (result.rowCount === 0) {
                res.send(404);
                return;
            }

            var row = result.rows[0];
            if (row.random !== link_id.slice(-2)) {
                res.send(404);
                return;
            }

            res.redirect(row.url);
            redisClient.set(link_id, row.url);
            redisClient.expire(link_id, 10);
        });
    });
});

var server = app.listen(process.env.PORT || 3000, function() {
    console.log('Listening on port %d', server.address().port);
});
