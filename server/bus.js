/* In-process event bus: game results, chat, announcements and odds changes are pushed to browsers via SSE. */
'use strict';
const EventEmitter = require('events');
const bus = new EventEmitter();
bus.setMaxListeners(0);
module.exports = bus;
