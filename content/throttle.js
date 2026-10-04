(function () {
  const sq = (window.sqOverlay = window.sqOverlay || {});

  function Queue(limit) {
    this.limit = limit;
    this.running = 0;
    this.waiting = [];
  }

  Queue.prototype.add = function (fn) {
    const self = this;
    return new Promise(function (resolve, reject) {
      self.waiting.push({ fn, resolve, reject });
      self.pump();
    });
  };

  Queue.prototype.pump = function () {
    const self = this;
    while (this.running < this.limit && this.waiting.length > 0) {
      const task = this.waiting.shift();
      this.running++;
      Promise.resolve()
        .then(task.fn)
        .then(
          function (v) {
            self.running--;
            task.resolve(v);
            self.pump();
          },
          function (e) {
            self.running--;
            task.reject(e);
            self.pump();
          }
        );
    }
  };

  sq.throttle = { defaultQueue: new Queue(sq.config.maxConcurrent) };
})();
