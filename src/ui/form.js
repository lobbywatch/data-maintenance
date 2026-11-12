function getRadioGroup(radioButtonElement) {
  return document.forms[0].elements.namedItem(radioButtonElement.name);
}

function scrollToFirstEmptyResponse() {
  Array.from(document.forms[0].elements)
    .filter((e) => e.name.startsWith("response"))
    .map((e) => getRadioGroup(e))
    .find((rnl) => !rnl.value)?.[0]
    .scrollIntoView({ behaviour: "smooth", block: "center" });
}

function toggleComment(element) {
  const commentDiv = element.parentElement.parentElement;
  if (getRadioGroup(element).value === "wrong") {
    commentDiv.querySelector("div:has(textarea)").removeAttribute("hidden");
    commentDiv.querySelector("textarea").setAttribute("required", "");
  } else {
    commentDiv.querySelector("div:has(textarea)").setAttribute("hidden", "");
    commentDiv.querySelector("textarea").removeAttribute("required");
  }
}

function showCommentIfWrongIsSelected() {
  document
    .querySelectorAll("input[name*=response_]")
    .forEach(function (element) {
      toggleComment(element);
      element.addEventListener("change", function () {
        toggleComment(element);
      });
    });
}

document.addEventListener("readystatechange", function () {
  if (document.readyState === "interactive") {
    scrollToFirstEmptyResponse();
    showCommentIfWrongIsSelected();
  }
});
