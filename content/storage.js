(function () {
  const sq = (window.sqOverlay = window.sqOverlay || {});
  const cfg = sq.config;

  function getUsers() {
    return browser.storage.local.get(cfg.usersKey).then(function (res) {
      return Array.isArray(res[cfg.usersKey]) ? res[cfg.usersKey] : [];
    });
  }

  function setUsers(users) {
    const obj = {};
    obj[cfg.usersKey] = users;
    return browser.storage.local.set(obj);
  }

  function findUser(users, uid) {
    return users.find(function (u) {
      return u.uid === uid;
    });
  }

  function addUser(uid, name) {
    if (!cfg.uidPattern.test(uid)) {
      return Promise.reject(new Error("Invalid UID: " + uid));
    }
    return getUsers().then(function (users) {
      if (findUser(users, uid)) return users;
      users.push({
        uid: uid,
        name: name || uid.slice(0, 6),
        color: sq.colors.colorForUid(uid),
        enabled: true,
      });
      return setUsers(users).then(function () {
        return users;
      });
    });
  }

  function removeUser(uid) {
    return getUsers().then(function (users) {
      const next = users.filter(function (u) {
        return u.uid !== uid;
      });
      return setUsers(next).then(function () {
        return next;
      });
    });
  }

  function patchUser(uid, patch) {
    return getUsers().then(function (users) {
      const u = findUser(users, uid);
      if (!u) return users;
      Object.assign(u, patch);
      return setUsers(users).then(function () {
        return users;
      });
    });
  }

  sq.storage = { getUsers, setUsers, addUser, removeUser, patchUser, findUser };
})();
