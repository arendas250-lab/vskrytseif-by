(function () {
  "use strict";

  // ---------- КОНФИГ ФОРМЫ ----------
  // Заявки уходят на серверный прокси (Cloudflare Worker, см. server/telegram-lead-worker.js),
  // который пересылает их в Telegram. Токен бота и chat_id хранятся только в секретах воркера,
  // а не в этом файле — сюда попадает лишь публичный URL воркера.
  // TODO: подставить реальный URL после деплоя воркера, например:
  // "https://vskrytseif-lead.<ваш-субдомен>.workers.dev"
  var LEAD_ENDPOINT = "";

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  // ---------- МОБИЛЬНОЕ МЕНЮ ----------
  function initMobileMenu() {
    var burger = qs(".burger");
    var menu = qs("#mobile-menu");
    if (!burger || !menu) return;

    function closeMenu() {
      menu.classList.remove("open");
      menu.setAttribute("aria-hidden", "true");
      burger.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
    }
    function openMenu() {
      menu.classList.add("open");
      menu.setAttribute("aria-hidden", "false");
      burger.setAttribute("aria-expanded", "true");
      document.body.classList.add("menu-open");
    }
    burger.addEventListener("click", function () {
      var isOpen = menu.classList.contains("open");
      if (isOpen) closeMenu(); else openMenu();
    });
    qsa("a", menu).forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
  }

  // ---------- UTM / АНАЛИТИКА ----------
  function getUtmParams() {
    var params = new URLSearchParams(window.location.search);
    var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
    var out = {};
    keys.forEach(function (k) {
      if (params.get(k)) out[k] = params.get(k);
    });
    return out;
  }

  function pushDataLayer(event, data) {
    window.dataLayer = window.dataLayer || [];
    var payload = Object.assign({ event: event }, data || {});
    window.dataLayer.push(payload);
  }

  function initClickTracking() {
    document.addEventListener("click", function (e) {
      var el = e.target.closest("[data-track]");
      if (!el) return;
      var type = el.getAttribute("data-track");
      if (type === "phone_click") {
        pushDataLayer("phone_click", { link_url: el.href });
      } else if (type === "messenger_click") {
        pushDataLayer("messenger_click", { messenger: el.dataset.messenger || "", link_url: el.href });
      }
    });
    if (document.querySelector(".price-table")) {
      pushDataLayer("view_prices", { page_path: window.location.pathname });
    }
  }

  // ---------- ФОРМА ЗАЯВКИ ----------
  var PHONE_RE = /^[\d\s()+\-]{6,20}$/;

  function validateField(field, input) {
    var value = input.value.trim();
    var valid = true;
    if (input.hasAttribute("required") && !value) valid = false;
    if (valid && input.type === "tel" && !PHONE_RE.test(value)) valid = false;
    field.classList.toggle("invalid", !valid);
    return valid;
  }

  function buildPayload(form) {
    var data = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      problem: form.problem.value.trim(),
      page_url: window.location.href,
      page_title: document.title,
      referrer: document.referrer || "",
      utm: getUtmParams(),
      submitted_at: new Date().toISOString()
    };
    return data;
  }

  function initLeadForms() {
    qsa("form.lead-form").forEach(function (form) {
      var loadedAt = Date.now();
      var status = qs(".form-status", form);
      var submitBtn = qs('button[type="submit"]', form);

      qsa(".field", form).forEach(function (field) {
        var input = qs("input, textarea", field);
        if (!input) return;
        input.addEventListener("blur", function () { validateField(field, input); });
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault();

        // Honeypot: скрытое поле, которое боты обычно заполняют.
        var honeypot = qs(".hp-field input", form);
        if (honeypot && honeypot.value) return;

        // Time-trap: форма не должна отправляться быстрее чем за 2 секунды после загрузки.
        if (Date.now() - loadedAt < 2000) return;

        var consent = qs('input[name="consent"]', form);
        var valid = true;
        qsa(".field", form).forEach(function (field) {
          var input = qs("input, textarea", field);
          if (input && !validateField(field, input)) valid = false;
        });
        if (consent && !consent.checked) {
          valid = false;
          consent.closest(".consent").classList.add("invalid-consent");
        }
        if (!valid) {
          status.textContent = "Проверьте правильность заполнения полей.";
          status.className = "form-status show error";
          return;
        }

        status.textContent = "Отправляем заявку…";
        status.className = "form-status show loading";
        if (submitBtn) submitBtn.disabled = true;

        var payload = buildPayload(form);

        if (!LEAD_ENDPOINT) {
          // Эндпоинт приёма заявок не настроен — сообщаем об этом честно, не притворяясь успехом.
          status.textContent = "Не удалось отправить. Позвоните по номеру +375 29 771-77-97.";
          status.className = "form-status show error";
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        fetch(LEAD_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
          .then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            status.textContent = "Заявка отправлена. Свяжемся с вами в течение 5 минут.";
            status.className = "form-status show success";
            pushDataLayer("generate_lead", { utm: payload.utm, page_path: window.location.pathname });
            form.reset();
          })
          .catch(function () {
            status.textContent = "Не удалось отправить. Позвоните по номеру +375 29 771-77-97.";
            status.className = "form-status show error";
          })
          .finally(function () {
            if (submitBtn) submitBtn.disabled = false;
          });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initMobileMenu();
    initClickTracking();
    initLeadForms();
  });
})();
