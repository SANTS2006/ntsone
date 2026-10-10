// The offline page's one button. (A separate file because the site's security policy does not allow scripts written inside a page.)
(function () {
  var status = document.getElementById("status");
  var retry = document.getElementById("retry");
  function go() {
    window.location.replace("/");
  }
  retry.addEventListener("click", function () {
    if (navigator.onLine === false) {
      status.textContent = "Still offline. Please check your connection.";
      return;
    }
    status.textContent = "Reconnecting...";
    go();
  });
  // Back online by itself: open the app again.
  window.addEventListener("online", go);
})();
