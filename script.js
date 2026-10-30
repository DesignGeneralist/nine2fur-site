(function () {
  "use strict";

  // Local time in the top bar.
  var now = document.getElementById("now");
  function tick() {
    if (!now) return;
    var d = new Date();
    var h = d.getHours() % 12 || 12;
    var m = String(d.getMinutes()).padStart(2, "0");
    now.textContent = h + ":" + m + (d.getHours() < 12 ? " am" : " pm");
  }
  tick();
  setInterval(tick, 15000);

  // Fake clock in (top bar).
  var inBtn = document.getElementById("clockin");
  var inLabel = document.getElementById("clockin-label");
  if (inBtn && inLabel) {
    inBtn.addEventListener("click", function () {
      var on = inBtn.getAttribute("aria-pressed") !== "true";
      inBtn.setAttribute("aria-pressed", String(on));
      inLabel.textContent = on ? "Clocked in 9:01" : "Clock in";
    });
  }

  // Fake clock out (follow section).
  var outBtn = document.getElementById("clockout");
  var outLabel = document.getElementById("clockout-label");
  var outTime = document.getElementById("out-time");
  var punch = outBtn && outBtn.closest(".punch");
  if (outBtn && outLabel && outTime && punch) {
    outBtn.addEventListener("click", function () {
      var on = outBtn.getAttribute("aria-pressed") !== "true";
      outBtn.setAttribute("aria-pressed", String(on));
      outLabel.textContent = on ? "Clocked out 6:00" : "Clock out";
      outTime.textContent = on ? "6:00" : "--:--";
      punch.classList.toggle("is-out", on);
    });
  }
})();
