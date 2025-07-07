const faqItems = Array.from(document.querySelectorAll(".faq-item"));
for (const item of faqItems) {
    const onClick = () => {
        item.classList.toggle("active");
    };
    item.addEventListener("click", onClick);
}
