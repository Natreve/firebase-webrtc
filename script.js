/*jshint esversion: 8 */
(async () => {
  "use strict";
  const messages = document.querySelector(".messages-content");
  const input = document.querySelector(".action-box-input");
  let isTyping = true;
  let uctTimer = null;

  const userTypingClear = function () {
    uctTimer = setTimeout(function () {
      document.querySelector(".message.personal.typing").remove();
      isTyping = true;
    }, 3500);
  };
  const setDate = function () {
    let date = new Date();
    let time = document.createTextNode(
      `${date.getHours()}: ${
        date.getMinutes() < 10 ? 0 : ""
      }${date.getMinutes()}`
    );
    let timestamp = document.createElement("div");
    timestamp.classList.add("timestamp");
    timestamp.appendChild(time);
    return document.querySelector(".message:last-child").append(timestamp);
  };
  const insertMessage = function () {
    let message = document.createElement("div");
    let text = document.createTextNode(input.value);
    if (!input) return;

    message.classList.add("message");
    message.appendChild(text);
    message.classList.add("personal");
    messages.append(message);

    setDate();

    input.value = null;
    document.querySelector(".message.personal.typing").remove();
    isTyping = true;
    clearTimeout(uctTimer);
  };
  window.addEventListener("keydown", function (e) {
    if (e.which === 13) {
      insertMessage();
      return false;
    }
  });
  input.addEventListener("input", function (e) {
    if (e.target.value !== "" && isTyping === true && e.which !== 13) {
      let typing = document.createElement("div");
      let span = document.createElement("span");
      typing.classList.add("message", "personal", "typing");

      typing.appendChild(span);
      messages.append(typing);

      isTyping = false;
      userTypingClear();
    }
  });
})();
