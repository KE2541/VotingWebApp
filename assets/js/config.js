var API_BASE = (function() {
    var path = window.location.pathname;
    var base = path.replace(/\/[^/]*$/, '');
    base = base.replace(/\/admin$/, '');
    return base;
})();
