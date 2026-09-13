(async () => {
  const files = ['app-core.js', 'app-ui.js', 'app-airlines.js', 'app-main.js'];
  for (const src of files) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      document.head.appendChild(script);
    });
  }
})().catch(error => {
  console.error(error);
  const banner = document.getElementById('errorBanner');
  if (banner) {
    banner.textContent = `Falha ao carregar o JavaScript do radar: ${error.message}`;
    banner.classList.remove('hidden');
  }
});
