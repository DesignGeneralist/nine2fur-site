(function () {
  "use strict";

  /* ------------------------------------------------------------------
     Small helpers
  ------------------------------------------------------------------ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function restartAnim(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // reflow so the animation can run again
    el.classList.add(cls);
  }

  /* ------------------------------------------------------------------
     Top bar: local time, fake clock in
  ------------------------------------------------------------------ */
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

  var inBtn = document.getElementById("clockin");
  var inLabel = document.getElementById("clockin-label");
  if (inBtn && inLabel) {
    inBtn.addEventListener("click", function () {
      var on = inBtn.getAttribute("aria-pressed") !== "true";
      inBtn.setAttribute("aria-pressed", String(on));
      inLabel.textContent = on ? "Clocked in 9:01" : "Clock in";
    });
  }

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

  /* ------------------------------------------------------------------
     Sound: tiny synthesised effects (Web Audio). Nothing is created or
     played until a person presses something. Mute is remembered.
  ------------------------------------------------------------------ */
  var Sound = (function () {
    var KEY = "n2f-sound";
    var on = true;
    var ctx = null;
    var master = null;
    var toggles = $$("[data-sound-toggle]");

    try { if (window.localStorage.getItem(KEY) === "off") on = false; } catch (e) { /* storage blocked: stay on */ }

    function paint() {
      toggles.forEach(function (b) {
        b.setAttribute("aria-pressed", String(on));
        var st = $(".chip-state", b);
        if (st) st.textContent = on ? "on" : "off";
      });
    }

    // Only ever called from inside a click/tap/key handler.
    function ensure() {
      if (!on) return null;
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.55;
          master.connect(ctx.destination);
        } catch (e) { ctx = null; return null; }
      }
      if (ctx.state === "suspended" && ctx.resume) { try { ctx.resume(); } catch (e) { /* ignore */ } }
      return ctx;
    }

    // One oscillator with a soft attack and an exponential fade (no clicks).
    function tone(t, freq, dur, o) {
      o = o || {};
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      var peak = o.gain == null ? 0.25 : o.gain;
      osc.type = o.type || "sine";
      osc.frequency.setValueAtTime(freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + (o.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      var out = osc;
      if (o.lp) {
        var f = ctx.createBiquadFilter();
        f.type = "lowpass"; f.frequency.value = o.lp;
        osc.connect(f); out = f;
      }
      out.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + dur + 0.05);
    }

    function noise(t, dur, o) {
      o = o || {};
      var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var f = ctx.createBiquadFilter();
      f.type = o.type || "bandpass";
      f.frequency.value = o.freq || 1500;
      f.Q.value = o.q || 1;
      var g = ctx.createGain();
      var peak = o.gain == null ? 0.2 : o.gain;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + 0.02);
    }

    var fx = {
      // Syed: a polite two-note "hmm" and a tiny pen click
      syed: function (t) {
        tone(t, 165, 0.22, { type: "sawtooth", lp: 650, gain: 0.22, attack: 0.04 });
        tone(t + 0.26, 196, 0.32, { type: "sawtooth", lp: 700, gain: 0.22, attack: 0.04 });
        noise(t + 0.62, 0.03, { freq: 3200, q: 2, gain: 0.12 });
      },
      // Pip: squeaky double chirp and a feather flutter
      pip: function (t) {
        tone(t, 1500, 0.12, { to: 2900, gain: 0.2 });
        tone(t + 0.16, 1700, 0.13, { to: 3200, gain: 0.2 });
        noise(t + 0.34, 0.22, { freq: 5200, q: 0.8, gain: 0.09 });
      },
      // Mo: soft "fwump" step, then a slow "tink"
      mo: function (t) {
        tone(t, 150, 0.2, { to: 52, gain: 0.45, attack: 0.008 });
        noise(t, 0.12, { type: "lowpass", freq: 380, gain: 0.25 });
        tone(t + 0.5, 2093, 0.45, { gain: 0.12 });
        tone(t + 0.5, 3136, 0.3, { gain: 0.05 });
      },
      // Ms. Hoot: a soft creak, then a gentle phone chime
      hoot: function (t) {
        for (var i = 0; i < 9; i++) {
          tone(t + i * 0.045, 95 + Math.random() * 55, 0.05, { type: "square", lp: 520, gain: 0.07, attack: 0.005 });
        }
        tone(t + 0.5, 1319, 0.5, { gain: 0.16 });
        tone(t + 0.68, 1047, 0.6, { gain: 0.16 });
      },
      // lead mood change
      boing: function (t) { tone(t, 330, 0.16, { to: 660, gain: 0.18, type: "triangle" }); },
      tick: function (t) { tone(t, 880, 0.07, { gain: 0.14, type: "triangle" }); },
      toggle: function (t) { tone(t, 740, 0.08, { gain: 0.14, type: "triangle" }); tone(t + 0.08, 988, 0.1, { gain: 0.14, type: "triangle" }); },
      // quiz result: little ta-da
      tada: function (t) {
        [523, 659, 784, 1047].forEach(function (f, i) { tone(t + i * 0.1, f, i === 3 ? 0.6 : 0.2, { type: "triangle", gain: 0.2 }); });
      },
      // suggestion box: printer chatter and a ding
      print: function (t) {
        for (var i = 0; i < 6; i++) noise(t + i * 0.055, 0.04, { freq: 2400, q: 2, gain: 0.14 });
        tone(t + 0.42, 1568, 0.4, { gain: 0.14 });
      },
      // desk phone ringing (two rings)
      ring: function (t) {
        for (var r = 0; r < 2; r++) {
          for (var k = 0; k < 10; k++) {
            tone(t + r * 1.15 + k * 0.06, k % 2 ? 1046 : 880, 0.05, { gain: 0.1, type: "square", lp: 2600, attack: 0.004 });
          }
        }
      },
      pickup: function (t) { noise(t, 0.05, { freq: 1200, q: 1, gain: 0.2 }); tone(t + 0.08, 660, 0.12, { gain: 0.12, type: "triangle" }); },
      hangup: function (t) { tone(t, 520, 0.09, { gain: 0.12, type: "triangle" }); noise(t + 0.1, 0.04, { freq: 1000, q: 1, gain: 0.18 }); }
    };

    function play(name) {
      var c = ensure();
      if (!c || !fx[name]) return;
      try { fx[name](c.currentTime + 0.02); } catch (e) { /* a missing sound is never fatal */ }
    }

    function set(next) {
      on = next;
      try { window.localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) { /* ignore */ }
      paint();
    }

    toggles.forEach(function (b) {
      b.addEventListener("click", function () {
        set(!on);
        if (on) play("toggle");
      });
    });
    paint();

    return { play: play, isOn: function () { return on; } };
  })();

  /* ------------------------------------------------------------------
     Cast: say hi (tap/click a badge or press "Say hi")
  ------------------------------------------------------------------ */
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var live = document.getElementById("cast-live");
  var hiLines = {
    syed: "Syed says: sounds good!",
    pip: "Pip chirps: what if we tried something bigger?",
    mo: "Mo gives a slow blink. Tink.",
    hoot: "Ms. Hoot gives a nod. One second, she is on a call."
  };
  var hiTimers = {};

  function sayHi(card) {
    var who = card.getAttribute("data-who");
    if (!who) return;
    restartAnim(card, "is-hi");
    clearTimeout(hiTimers[who]);
    hiTimers[who] = setTimeout(function () { card.classList.remove("is-hi"); }, 1600);
    if (live) {
      live.textContent = "";
      // a tick later so repeat taps are announced again
      setTimeout(function () { live.textContent = hiLines[who] + (Sound.isOn() ? "" : " (Sound is off.)"); }, 30);
    }
    Sound.play(who);
  }

  $$(".id-card[data-who]").forEach(function (card) {
    card.addEventListener("click", function (e) {
      // the lead's mood controls and any links do their own thing
      if (e.target.closest(".mood, a")) return;
      sayHi(card);
    });
  });

  /* ------------------------------------------------------------------
     Lead card: Syed's mood carousel (tap the photo, pick a face, or hover)
  ------------------------------------------------------------------ */
  (function () {
    var root = $("[data-mood]");
    if (!root) return;
    var frame = $(".mood-frame", root);
    var imgs = $$(".mood-img", root);
    var thumbs = $$(".mood-thumb", root);
    var text = $(".mood-text", root);
    var current = 0;

    function show(i, user) {
      current = (i + imgs.length) % imgs.length;
      imgs.forEach(function (img, n) { img.classList.toggle("is-on", n === current); });
      thumbs.forEach(function (t, n) { t.setAttribute("aria-pressed", String(n === current)); });
      var t = thumbs[current];
      var label = t.getAttribute("data-label");
      text.textContent = label;
      frame.setAttribute("aria-label", "Syed, " + t.getAttribute("data-desc") + ". Press for his next mood.");
      if (user) {
        restartAnim(frame, "is-pop");
        Sound.play("boing");
      }
    }

    frame.addEventListener("click", function () { show(current + 1, true); });
    thumbs.forEach(function (t, n) {
      t.addEventListener("click", function () { show(n, true); });
      // mouse hover previews a mood (touch and keyboard use the buttons)
      t.addEventListener("pointerenter", function (e) {
        if (e.pointerType === "mouse" && n !== current) show(n, false);
      });
    });
  })();

  /* ------------------------------------------------------------------
     Quiz: which coworker are you?
  ------------------------------------------------------------------ */
  (function () {
    var body = document.getElementById("quiz-body");
    var win = document.getElementById("quiz-win");
    if (!body) return;

    var questions = [
      {
        q: "A calendar invite lands: “Meeting about the meeting, 10:00.” You…",
        a: [
          ["syed", "Accept in four seconds and add a polite note."],
          ["pip", "Suggest a third meeting to plan the first two."],
          ["mo", "Accept. Arrive early. Already seated."],
          ["hoot", "Join mid-call from the corridor and still end it on time."]
        ]
      },
      {
        q: "The client says, “Just a small change, by Friday.” You…",
        a: [
          ["syed", "Smile, say “sounds good!” and panic quietly."],
          ["pip", "Have 40 ideas. Number 12 is a whole new app."],
          ["mo", "Blink slowly. Start fixing it. Say nothing."],
          ["hoot", "Say “let’s take that offline.” It is now fine."]
        ]
      },
      {
        q: "At the chai stall, you are the one who…",
        a: [
          ["syed", "Retells the entire meeting, with gestures."],
          ["pip", "Orders lemon tea, two biscuits and a suggestion for the stall."],
          ["mo", "Was already there, mid-sip."],
          ["hoot", "Arrives last, still on a call. Your order is already poured."]
        ]
      },
      {
        q: "On a video call, someone says “you’re on mute.” That someone is…",
        a: [
          ["syed", "You. Gently. Every single time."],
          ["pip", "Not you. You unmute with great confidence and say “sorry, go ahead.”"],
          ["mo", "Nobody. Mo is on mute. Mo is fine."],
          ["hoot", "Nobody. You are on another call, with the right button pressed."]
        ]
      },
      {
        q: "Friday, 6:55 pm. The build breaks. You…",
        a: [
          ["syed", "Send a very polite update to everyone. Twice."],
          ["pip", "Propose a rewrite, in a new framework, tonight."],
          ["mo", "Fix it quietly. Nobody ever finds out it broke."],
          ["hoot", "Call the client. The client says thank you."]
        ]
      }
    ];

    var results = {
      syed: {
        img: "assets/syed-hero.jpg", job: "Junior Analyst", role: "The lead",
        alt: "Syed smiling politely at the camera.",
        quip: "You are the most polite person in every meeting and the most dramatic at the chai stall. Everyone feels very listened to. You feel a little tired.",
        facts: [["In a meeting", "Nods first, thinks second, still smiling"], ["At the chai stall", "One by two, plus the full story"], ["Friday, 6:55 pm", "A polite update. Then another."]]
      },
      pip: {
        img: "assets/pip-card.jpg", job: "Head of Bold Ideas", role: "The accelerant",
        alt: "Pip the felt pigeon with one wing raised, bursting with an idea.",
        quip: "You had four ideas while reading this sentence. The team is a little nervous and a lot more excited than before you joined.",
        facts: [["In a meeting", "“Quick thought!” (it was not quick)"], ["At the chai stall", "Lemon tea, a biscuit and feedback for the stall"], ["Friday, 6:55 pm", "A rewrite. In a new framework."]]
      },
      mo: {
        img: "assets/mo-card.jpg", job: "Senior Analyst", role: "The anchor",
        alt: "Mo the felt capybara calmly sipping chai.",
        quip: "You never hurry, and you are somehow always already there. Things get quietly fixed around you and nobody asks how.",
        facts: [["In a meeting", "Seated early, camera on, completely calm"], ["At the chai stall", "Already there. Mid-sip."], ["Friday, 6:55 pm", "Fixes it, tells no one, goes home"]]
      },
      hoot: {
        img: "assets/hoot-card.jpg", job: "Director of Everything", role: "The authority",
        alt: "Ms. Hoot the felt owl with a phone to her ear.",
        quip: "You are calm, kind and on a call. When you turn around, the room goes quiet, and then everyone feels reassured.",
        facts: [["In a meeting", "Joins from the corridor, ends it on time"], ["At the chai stall", "Arrives last. The order is already poured."], ["Friday, 6:55 pm", "Calls the client. Gets a thank you."]]
      }
    };
    var names = { syed: "Syed", pip: "Pip", mo: "Mo", hoot: "Ms. Hoot" };
    var order = ["syed", "pip", "mo", "hoot"];

    var state;
    function reset() { state = { i: 0, scores: { syed: 0, pip: 0, mo: 0, hoot: 0 }, history: [] }; }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

    function focusTitle(sel) {
      var el = $(sel, body);
      if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
    }
    function bringIntoView() {
      if (!win) return;
      var r = win.getBoundingClientRect();
      if (r.top < 70 || r.top > window.innerHeight * 0.6) {
        win.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
      }
    }

    function renderQuestion(userAction) {
      var n = state.i;
      var item = questions[n];
      var html = '<p class="quiz-step">Question ' + (n + 1) + ' of ' + questions.length + '</p>' +
        '<div class="quiz-meter" role="progressbar" aria-label="Quiz progress" aria-valuemin="0" aria-valuemax="' + questions.length + '" aria-valuenow="' + n + '"><span style="width:' + (n / questions.length * 100) + '%"></span></div>' +
        '<h3 class="quiz-title" tabindex="-1">' + esc(item.q) + '</h3>' +
        '<div class="answers">';
      item.a.forEach(function (ans) {
        html += '<button class="answer" type="button" data-who="' + ans[0] + '">' + esc(ans[1]) + '</button>';
      });
      html += '</div>';
      body.innerHTML = html;
      var bar = $(".quiz-meter span", body);
      if (bar) { // fill to the new step on the next frame so the bar animates
        requestAnimationFrame(function () { bar.style.width = ((n + 1) / questions.length * 100) + "%"; });
        var m = $(".quiz-meter", body); if (m) m.setAttribute("aria-valuenow", String(n + 1));
      }
      if (userAction) { focusTitle(".quiz-title"); bringIntoView(); }
    }

    function winner() {
      var best = -1;
      order.forEach(function (k) { if (state.scores[k] > best) best = state.scores[k]; });
      var tied = order.filter(function (k) { return state.scores[k] === best; });
      if (tied.length === 1) return tied[0];
      // tie: the most recent answer among the tied characters decides
      for (var i = state.history.length - 1; i >= 0; i--) {
        if (tied.indexOf(state.history[i]) !== -1) return state.history[i];
      }
      return tied[0];
    }

    function renderResult() {
      var who = winner();
      var r = results[who];
      var name = names[who];
      var html = '<div class="result"><div class="id-wrap">' +
        '<div class="lanyard" aria-hidden="true"></div>' +
        '<div class="badge">' +
        '<span class="stamp" aria-hidden="true">Match</span>' +
        '<div class="result-head">' +
        '<img class="photo" src="' + r.img + '" width="440" height="440" alt="' + esc(r.alt) + '">' +
        '<div><p class="job">' + esc(r.role) + '</p><h3 class="result-title" tabindex="-1">You are ' + esc(name) + '</h3><p class="job">' + esc(r.job) + '</p></div>' +
        '</div>' +
        '<p class="result-quip">' + esc(r.quip) + '</p>' +
        '<dl class="facts">';
      r.facts.forEach(function (f) { html += '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>'; });
      html += '</dl>' +
        '<div class="result-actions">' +
        '<button class="btn btn--mustard" type="button" id="share-btn">Share my result</button>' +
        '<a class="btn btn--navy" href="https://www.instagram.com/nine2fur/" target="_blank" rel="noopener">Follow @nine2fur</a>' +
        '<button class="again" type="button" id="again-btn">Take it again</button>' +
        '</div>' +
        '<p class="share-note" id="share-note" aria-live="polite"></p>' +
        '</div></div></div>';
      body.innerHTML = html;
      Sound.play("tada");
      focusTitle(".result-title");
      bringIntoView();

      var shareText = "I’m " + name + " from Nine to Fur (" + r.role.toLowerCase() + "). Which office coworker are you?";
      var shareUrl = "https://nine2fur.com/#quiz";
      var note = $("#share-note", body);
      $("#share-btn", body).addEventListener("click", function () {
        function say(msg) { note.textContent = ""; setTimeout(function () { note.textContent = msg; }, 30); }
        if (navigator.share) {
          navigator.share({ title: "Nine to Fur", text: shareText, url: shareUrl }).catch(function () { /* cancelled */ });
          return;
        }
        var full = shareText + " " + shareUrl;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(full).then(function () { say("Copied. Paste it anywhere."); }, function () { say(full); });
        } else {
          say(full);
        }
      });
      $("#again-btn", body).addEventListener("click", function () {
        reset();
        renderQuestion(true);
      });
    }

    body.addEventListener("click", function (e) {
      var btn = e.target.closest(".answer");
      if (!btn || !body.contains(btn)) return;
      var who = btn.getAttribute("data-who");
      state.scores[who] += 1;
      state.history.push(who);
      state.i += 1;
      Sound.play("tick");
      if (state.i >= questions.length) renderResult();
      else renderQuestion(true);
    });

    reset();
    renderQuestion(false);
  })();

  /* ------------------------------------------------------------------
     Front desk: Pip's suggestion box
  ------------------------------------------------------------------ */
  (function () {
    var btn = document.getElementById("idea-btn");
    var slip = document.getElementById("slip");
    var text = document.getElementById("slip-text");
    if (!btn || !slip || !text) return;

    var ideas = [
      "What if every conference room was named after a chai? Masala, Ginger, Elaichi, Tulsi.",
      "A bell on the wall. Ring it when the meeting is over. I volunteer to ring it.",
      "A standup, but with a cricket commentator. “And Syed goes for the update. What a shot!”",
      "What if the Friday release had a snack countdown?",
      "A Slack channel for good news only. I made it. It has one member. Hi.",
      "Auto-reply: “At chai. Back in ten. Or twenty-five.”",
      "A suggestion box for the suggestion box.",
      "A no-meeting hour, every day. We can call it the meeting about not meeting.",
      "Laptop stickers for the whole team. One each. I already did yours.",
      "What if the corridor to the pantry had a traffic report?",
      "A wall clock for chai o’clock. It is always close.",
      "Free biscuits at 4:00. For morale. And for me.",
      "A walking meeting! Everyone gets a lap of the building and an opinion.",
      "Name tags that also say your favourite snack. Mine says “all of them.”",
      "What if the lift said “well done” every time somebody went up a floor?"
    ];
    var bag = [];
    var last = -1;
    function next() {
      if (!bag.length) {
        bag = ideas.map(function (_, i) { return i; });
        for (var i = bag.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
        if (bag[bag.length - 1] === last) bag.unshift(bag.pop());
      }
      last = bag.pop();
      return ideas[last];
    }

    btn.addEventListener("click", function () {
      text.textContent = next();
      restartAnim(slip, "is-new");
      btn.textContent = "Another idea";
      Sound.play("print");
    });
  })();

  /* ------------------------------------------------------------------
     Front desk: call Ms. Hoot
  ------------------------------------------------------------------ */
  (function () {
    var station = document.getElementById("call-station");
    var btn = document.getElementById("call-btn");
    var label = document.getElementById("call-label");
    var status = document.getElementById("call-status");
    var reply = document.getElementById("call-reply");
    if (!station || !btn || !label || !status || !reply) return;

    var replies = [
      "Hi, you’ve reached Ms. Hoot. I’m on another call, but you are doing great. Let’s take this offline.",
      "Mm-hm. Mm-hm. Sounds good! Sorry, not you. You’re doing great.",
      "I’ve approved your leave. Don’t tell the other call.",
      "Whatever it is, the answer is yes. Sorry, call waiting. Lovely to hear from you.",
      "One second. I’m in a meeting about a meeting. You are my favourite call today.",
      "Can you hear me? I can hear you. Wonderful. Please hold, I’ll be right back with kindness."
    ];
    var n = Math.floor(Math.random() * replies.length);
    var phase = "idle"; // idle -> ringing -> connected -> (hang up) idle

    btn.addEventListener("click", function () {
      if (phase === "ringing") return;
      if (phase === "connected") {
        phase = "idle";
        status.textContent = "Call ended";
        label.textContent = "Call Ms. Hoot";
        Sound.play("hangup");
        return;
      }
      phase = "ringing";
      btn.setAttribute("aria-disabled", "true");
      station.classList.add("is-ringing");
      label.textContent = "Calling…";
      status.textContent = "Ringing…";
      reply.textContent = "Ringing Ms. Hoot…";
      Sound.play("ring");

      setTimeout(function () {
        station.classList.remove("is-ringing");
        status.textContent = "Connected";
        n = (n + 1) % replies.length;
        reply.textContent = replies[n];
        label.textContent = "Hang up";
        btn.removeAttribute("aria-disabled");
        phase = "connected";
        Sound.play("pickup");
      }, 2500);
    });
  })();
})();
