(function () {
  const FORM_ENDPOINT = 'https://financielebegrippen.com/wp-admin/admin-ajax.php';

  function showMessage(el, text, type) {
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('is-success', 'is-error');
    el.classList.add(type === 'success' ? 'is-success' : 'is-error');
  }

  function initContactForm() {
    const form = document.getElementById('contact-form');
    const messageEl = document.getElementById('contact-form-message');
    if (!form || !messageEl) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const formData = new FormData(form);
      formData.set('action', 'elementor_pro_forms_send_form');

      try {
        const response = await fetch(FORM_ENDPOINT, {
          method: 'POST',
          body: formData,
          mode: 'cors',
        });

        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          if (data.success !== false) {
            form.reset();
            showMessage(
              messageEl,
              'Bedankt voor je bericht. We nemen zo snel mogelijk contact met je op.',
              'success'
            );
            return;
          }
        }

        throw new Error('submit failed');
      } catch {
        showMessage(
          messageEl,
          'Je bericht kon niet worden verzonden. Probeer het later opnieuw of mail naar info@financielebegrippen.com.',
          'error'
        );
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initContactForm);
  } else {
    initContactForm();
  }
})();
