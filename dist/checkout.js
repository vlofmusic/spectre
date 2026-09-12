/* Message-based order requests; no payment or completed purchase is implied. */
(() => {
  const dialog = document.getElementById('bag');
  if (!dialog) return;
  const product = window.SpectreCatalog;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const panel = document.createElement('section');
  panel.className = 'sc-checkout';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'checkout-title');
  panel.innerHTML = `
    <button class="sc-checkout-back" type="button" data-checkout-back><span aria-hidden="true">←</span> Back to bag</button>
    <div data-checkout-intro><p class="sc-checkout-kicker">A PERSONAL FOLLOW-UP</p><h3 id="checkout-title" tabindex="-1">Let’s arrange<br /><em>your hoodie.</em></h3><p class="sc-checkout-lede">Leave a contact and we’ll confirm the details with you.</p></div>
    <form class="sc-checkout-form" data-checkout-form>
      <fieldset data-checkout-fields><legend class="ap-sr-only">Your contact and preferences</legend>
        <label for="checkout-name">Your name<input id="checkout-name" name="name" type="text" autocomplete="name" maxlength="120" required /></label>
        <label for="checkout-method">How should we reply?<select id="checkout-method" name="contactMethod"><option value="email">Email</option><option value="telegram">Telegram</option><option value="instagram">Instagram</option></select></label>
        <label for="checkout-contact"><span data-checkout-contact-label>Email address</span><input id="checkout-contact" name="contact" type="email" autocomplete="email" maxlength="200" required aria-describedby="checkout-contact-hint" /></label><p class="sc-checkout-hint" id="checkout-contact-hint" data-checkout-contact-hint>We’ll use this to discuss your request.</p>
        <label class="sc-checkout-check" for="checkout-drawstrings"><input id="checkout-drawstrings" name="drawstrings" type="checkbox" /><span>I’d like to add drawstrings<small>The hoodie comes without them by default.</small></span></label>
        <label for="checkout-notes">Anything else? <span class="sc-checkout-optional">Optional</span><textarea id="checkout-notes" name="notes" rows="3" maxlength="1000" placeholder="A delivery location or a question about the fit…"></textarea></label>
      </fieldset>
      <p class="sc-checkout-disclosure">When you send this request, your contact details and selection are sent to Spectre via Telegram to arrange the order. No payment is taken.</p>
      <p class="sc-checkout-status" data-checkout-status role="status"></p>
      <button class="sc-checkout-back" type="button" data-checkout-resize hidden>Choose your size again ↑</button>
      <button class="sc-request sc-checkout-submit" type="submit" data-checkout-submit disabled><span data-checkout-submit-label>Preparing request…</span><span aria-hidden="true">↗</span></button>
      <p class="sc-checkout-alternative">Prefer email? <a data-checkout-email href="mailto:hello@spectre-studio.co?subject=Spectre%20Hoodie%20enquiry">Send your selection directly ↗</a></p>
    </form>
    <div class="sc-checkout-result" data-checkout-result hidden><p class="sc-checkout-kicker" data-checkout-reference></p><h3 tabindex="-1" data-checkout-result-title></h3><p data-checkout-result-message></p><div class="sc-confirmation" data-customer-confirmation hidden><p class="sc-checkout-kicker">YOUR CONFIRMATION</p><p data-confirmation-message role="status"></p><a class="sc-request" data-confirmation-telegram target="_blank" rel="noopener noreferrer" hidden>Receive it in Telegram <span aria-hidden="true">↗</span></a></div><p class="sc-checkout-hint" data-checkout-deadline></p><p class="sc-checkout-hint">This is a request, not a completed order. No payment has been taken. A confirmation message does not extend or renew your reservation.</p><a class="sc-request" data-checkout-result-email href="mailto:hello@spectre-studio.co">Follow up by email <span aria-hidden="true">↗</span></a><button class="sc-checkout-back" type="button" data-checkout-result-back>Back to your selection <span aria-hidden="true">→</span></button></div>`;
  dialog.querySelector('[data-bag-body]').before(panel);
  const $ = selector => panel.querySelector(selector);
  const form = $('[data-checkout-form]');
  const fields = $('[data-checkout-fields]');
  const submit = $('[data-checkout-submit]');
  const submitLabel = $('[data-checkout-submit-label]');
  const status = $('[data-checkout-status]');
  const result = $('[data-checkout-result]');
  let enabled = null, sending = false, uncertain = false, availabilityVersion = 0;
  let lastAttempt = null, savedOrder = null, savedSelection = '';
  let confirmations = { email: false, telegram: false };

  const paintContactHint = () => {
    const method = form.elements.contactMethod.value;
    $('[data-checkout-contact-hint]').textContent = method === 'email'
      ? confirmations.email ? 'We’ll email a copy of your request and use this address to follow up.' : 'Your request number will appear here. We’ll use this address to follow up.'
      : method === 'telegram' && confirmations.telegram
        ? 'After sending, open our bot and tap Start to receive a copy. Enter your @username here for our personal follow-up.'
        : 'Include your @username so we can find the right account.';
    $('.sc-checkout-disclosure').textContent = 'Your contact details and selection are shared with Spectre via Telegram to arrange your order. '
      + (method === 'email' && confirmations.email ? 'A request confirmation will also be sent to your email. ' : '')
      + 'No payment is taken.';
  };

  const paintConfirmation = order => {
    const receipt = order.customerConfirmation;
    const card = $('[data-customer-confirmation]');
    const link = $('[data-confirmation-telegram]');
    link.hidden = true;
    link.removeAttribute('href');
    card.hidden = !receipt || receipt.channel === 'instagram' || receipt.status === 'manual';
    if (card.hidden) return;
    let text = 'Keep the request number above. An automatic copy is not available; Spectre will follow up using your contact details.';
    if (receipt.channel === 'email' && receipt.status === 'accepted') {
      text = 'Check your inbox and spam folder for a copy of this request. Keep the request number above if you need to follow up.';
    } else if (receipt.channel === 'telegram' && receipt.status === 'waiting_start') {
      text = 'Open our bot and tap Start to receive your request summary. This connects the confirmation to your Telegram chat.';
      try {
        const url = new URL(receipt.telegramUrl);
        if (url.protocol === 'https:' && url.hostname === 't.me' && !url.port && !url.username && !url.password && /^\/[A-Za-z0-9_]{5,32}$/.test(url.pathname) && /^r_[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('start') || '')) {
          link.href = url.href;
          link.hidden = false;
        } else text = 'Your request is saved. The Telegram confirmation link is unavailable; keep the request number above.';
      } catch { text = 'Your request is saved. The Telegram confirmation link is unavailable; keep the request number above.'; }
    } else if (receipt.status === 'sent') {
      text = 'Your request summary has been sent to your connected Telegram chat.';
    } else if (receipt.status === 'pending') {
      text = 'Your request is saved. Its confirmation is being prepared; keep the request number above.';
    } else if (['failed', 'uncertain'].includes(receipt.status)) {
      text = 'Your request is saved, but we could not confirm that your copy was sent. Keep the request number above; you do not need to place another request.';
    } else if (receipt.status === 'expired') {
      text = 'This confirmation link has expired. Your request remains saved; use its number if you contact us.';
    } else if (receipt.status === 'limited') {
      text = 'Your request is saved. We have paused additional automatic copies; please keep the request number above.';
    }
    $('[data-confirmation-message]').textContent = text;
  };

  const request = async (url, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try { const response=await fetch(url, { ...options, cache: 'no-store', signal: controller.signal }); return { response, data:await response.json() }; }
    finally { clearTimeout(timeout); }
  };
  const hasItems = () => Object.values(window.SpectreBagState?.items || {}).some(quantity => quantity > 0);
  const selectionIdentity = () => JSON.stringify({ items: window.SpectreBagState?.items, expiresAt: window.SpectreBagState?.expiresAt });
  const values = () => ({
    name: form.elements.name.value.trim(),
    contactMethod: form.elements.contactMethod.value,
    contact: form.elements.contact.value.trim(),
    drawstrings: form.elements.drawstrings.checked,
    notes: form.elements.notes.value.trim()
  });
  const emailLink = (reference = '') => {
    const details = values(), items = reference && lastAttempt ? lastAttempt.items : window.SpectreBagState?.items || {};
    const lines = Object.entries(items).filter(([, quantity]) => quantity > 0).map(([size, quantity]) => `${product.name}, ${product.colour}, size ${size} × ${quantity}`);
    const body = `Hello,${reference ? `\n\nI’m following up on request ${reference}.` : '\n\nI would like to enquire about:'}\n\n${lines.join('\n') || product.name}\n\nName: ${details.name}\nReply via ${details.contactMethod}: ${details.contact}\nDrawstrings requested: ${details.drawstrings ? 'Yes' : 'No'}\n${details.notes ? `Notes: ${details.notes}\n` : ''}\nPlease confirm availability, delivery cost, dispatch date and return terms.`;
    return `mailto:${product.email}?subject=${encodeURIComponent(reference ? `Spectre Hoodie — request ${reference}` : 'Spectre Hoodie — order enquiry')}&body=${encodeURIComponent(body)}`;
  };
  const paintSubmit = () => {
    submit.disabled = sending || enabled !== true || (!hasItems() && !uncertain);
    submit.setAttribute('aria-busy', String(sending));
    submitLabel.textContent = sending ? 'Sending your request…' : enabled === null ? 'Preparing request…' : uncertain ? 'Retry this request' : 'Send request';
    fields.disabled = sending || uncertain;
    $('[data-checkout-email]').href = emailLink(savedOrder?.reference);
  };
  const animateIn = () => {
    if (reduced.matches || !panel.animate) return;
    panel.getAnimations().forEach(animation => animation.cancel());
    panel.animate([{ opacity: 0, transform: 'translateY(12px) scale(.985)', filter: 'blur(5px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 340, easing: 'cubic-bezier(.2,.75,.2,1)' });
  };
  const checkEnabled = async () => {
    const version = ++availabilityVersion;
    enabled = null;
    paintSubmit();
    try {
      const {response,data} = await request('/api/checkout');
      if (!response.ok) throw new Error('Unavailable');
      if (version !== availabilityVersion) return;
      enabled = data.enabled === true;
      confirmations = { email: data.confirmations?.email === true, telegram: data.confirmations?.telegram === true };
      if (!uncertain) status.textContent = enabled ? '' : 'Online requests are not available right now. You can send your selection by email below.';
    } catch {
      if (version !== availabilityVersion) return;
      enabled = false;
      confirmations = { email: false, telegram: false };
      if (!uncertain) status.textContent = 'We could not connect just now. Your details stay here; you can send your selection by email.';
    }
    paintSubmit();
    paintContactHint();
    paintStockMessage();
  };
  const show = () => {
    if (savedOrder && window.SpectreBagState && savedSelection !== selectionIdentity()) {
      savedOrder = null;
      lastAttempt = null;
      form.hidden = false;
      $('[data-checkout-intro]').hidden = false;
      result.hidden = true;
    }
    panel.hidden = false;
    dialog.classList.add('sc-checkout-active');
    animateIn();
    (savedOrder ? $('[data-checkout-result-title]') : $('#checkout-title')).focus({ preventScroll: true });
    if (!savedOrder) checkEnabled();
  };
  const back = (focus = true) => {
    panel.hidden = true;
    dialog.classList.remove('sc-checkout-active');
    if (focus) (dialog.querySelector('[data-checkout-open]') || dialog.querySelector('[data-bag-close]')).focus({ preventScroll: true });
  };
  const showReceipt = order => {
    savedOrder = order;
    savedSelection = lastAttempt.selection;
    uncertain = false;
    form.hidden = true;
    $('[data-checkout-intro]').hidden = true;
    result.hidden = false;
    const confirmed = order.notificationStatus === 'sent';
    $('[data-checkout-reference]').textContent = `REQUEST ${order.reference}`;
    $('[data-checkout-result-title]').textContent = confirmed ? 'Request received.' : 'Request saved.';
    $('[data-checkout-result-message]').textContent = confirmed ? 'Spectre has been notified. We’ll get back to you to confirm availability, delivery and the next step.' : 'Your request is saved, but the Telegram notification has not been confirmed. Please email this reference so we can follow up.';
    $('[data-checkout-result-email]').href = emailLink(order.reference);
    paintConfirmation(order);
    const deadline = Number(order.holdExpiresAt);
    $('[data-checkout-deadline]').textContent = Number.isFinite(deadline)
      ? `Original reservation deadline: ${new Intl.DateTimeFormat('en-CH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Zurich' }).format(deadline)} (Zurich time). Changes to your bag can release items earlier.` : '';
    panel.scrollTop = 0;
    if (dialog.open && !panel.hidden) {
      animateIn();
      $('[data-checkout-result-title]').focus({ preventScroll: true });
    }
  };
  const returnToSizes = () => {
    const message = 'Your reservation is no longer active. Choose your size again to continue; your contact details have been kept.';
    status.textContent = message;
    document.querySelector('[data-size-error]').textContent = message;
    lastAttempt = null;
    uncertain = false;
    back(false);
    const focusSizes=() => {
      document.getElementById('top').scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth' });
      document.querySelector('input[name="size"]')?.focus({ preventScroll: true });
    };
    if(dialog.open){dialog.addEventListener('close',focusSizes,{once:true});dialog.querySelector('[data-bag-close]').click();}else focusSizes();
    window.dispatchEvent(new CustomEvent('spectre:stock-retry'));
  };
  const paintStockMessage=()=>{
    const empty=window.SpectreStockStatus?.status==='ready'&&!hasItems()&&!uncertain&&!sending;
    $('[data-checkout-resize]').hidden=!empty;
    if(empty)status.textContent='Your reservation is no longer active. Choose your size again; your details are kept here.';
    else if(!hasItems()&&!uncertain&&!sending&&window.SpectreStockStatus?.status==='error')status.textContent='Stock could not be checked. Your details are kept; reconnect or use email below.';
  };

  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-checkout-open]')) { event.preventDefault(); show(); }
  });
  $('[data-checkout-back]').addEventListener('click', () => back());
  $('[data-checkout-result-back]').addEventListener('click', () => back());
  $('[data-checkout-resize]').addEventListener('click', returnToSizes);
  dialog.addEventListener('close', () => back(false));
  form.elements.contactMethod.addEventListener('change', () => {
    const method = form.elements.contactMethod.value;
    form.elements.contact.type = method === 'email' ? 'email' : 'text';
    form.elements.contact.autocomplete = method === 'email' ? 'email' : 'off';
    form.elements.contact.placeholder = method === 'email' ? 'you@example.com' : '@yourusername';
    $('[data-checkout-contact-label]').textContent = method === 'email' ? 'Email address' : `${method === 'telegram' ? 'Telegram' : 'Instagram'} username`;
    paintContactHint();
    paintSubmit();
  });
  form.addEventListener('input', () => { if (!sending) paintSubmit(); });
  window.addEventListener('spectre:stock', () => { if (!panel.hidden && !savedOrder) {paintSubmit();paintStockMessage();} });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || enabled !== true || (!hasItems() && !uncertain)) return;
    if (!uncertain && !form.reportValidity()) return;
    const payload = uncertain && lastAttempt ? lastAttempt.payload : values();
    const identity = JSON.stringify({ payload, selection: selectionIdentity() });
    if (!lastAttempt || (!uncertain && identity !== lastAttempt.identity)) lastAttempt = { identity, selection:selectionIdentity(), payload, items: { ...window.SpectreBagState?.items }, requestKey: crypto.randomUUID() };
    sending = true;
    status.textContent = '';
    paintSubmit();
    try {
      const {response,data} = await request('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...lastAttempt.payload, requestKey: lastAttempt.requestKey }) });
      if (data.order?.reference) showReceipt(data.order);
      else if (response.status === 409) returnToSizes();
      else {
        uncertain = response.status >= 500 && response.status !== 503;
        status.textContent = response.status === 503 ? 'Online requests are unavailable right now. Your details are kept; please use the email link below.' : response.status === 400 ? 'Please check your contact details and try again.' : 'We could not confirm the request. Retry safely, or send your selection by email.';
      }
    } catch {
      uncertain = true;
      status.textContent = 'We could not confirm whether your request was received. Retry the same request safely, or send your selection by email.';
    } finally {
      sending = false;
      paintSubmit();
    }
  });
})();
