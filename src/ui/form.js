function scrollToFirstEmptyResponse() {
  Array.from(document.forms[0].elements)
    .filter((e) => e.name.startsWith("response"))
    .map((e) => document.forms[0].elements.namedItem(e.name))
    .find((rnl) => !rnl.value)[0]
    .scrollIntoView({ behaviour: "smooth", block: "center" });
}

document.addEventListener("readystatechange", function () {
  if (document.readyState === "interactive") {
    scrollToFirstEmptyResponse();
  }
});
