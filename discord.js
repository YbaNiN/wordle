/**
 * discord.js — Integración con Discord via webhooks
 * Formularios para peticiones, sugerencias, reportes y contacto
 */

const DISCORD_WEBHOOKS = {
  peticion: 'https://discord.com/api/webhooks/1483191111940833466/I0oTObDYd33oMThH7MaY0xDN3WLVbM46dFAg5t5VUHG45MEIKynKKiEvNXLa3ch4WbKz',
  sugerencia: 'https://discord.com/api/webhooks/1483191551340445929/vu0dAKoQcWc13rgRlt_YXEvu7pTaxiCduWvif8fC5Y9zGKjdikFPUMcEC9FwvkB5C-44',
  reporte: 'https://discord.com/api/webhooks/1483191722203807896/RPGzil504EBrjm-MHXFVPOk9lVy8xtsEGJAwhlgtuQqRAqkkvbkKvy0Vu8cMBi7qyrXP',
  contacto: 'https://discord.com/api/webhooks/1483191914617634866/i1rO1foLPvI0PTNoaJPdDfvBmAbfDHjTdNOM_eCj2IKW5fnCxrI6R3kgaVvZtvt96tkV'
};

const DISCORD_CONFIG = {
  peticion: {
    title: 'Nueva petición',
    emoji: '💡',
    color: 0x5a9a3c,
    placeholder: '¿Qué función te gustaría ver en el juego?',
    subjectPlaceholder: 'Ej: Modo contrarreloj',
    successMsg: '¡Petición enviada! Gracias por tu idea.'
  },
  sugerencia: {
    title: 'Nueva sugerencia',
    emoji: '💬',
    color: 0xc4a73b,
    placeholder: 'Describe tu sugerencia con detalle...',
    subjectPlaceholder: 'Ej: Mejorar las animaciones',
    successMsg: '¡Sugerencia enviada! La revisaremos pronto.'
  },
  reporte: {
    title: 'Nuevo reporte',
    emoji: '🐛',
    color: 0xd94444,
    placeholder: 'Describe el error: qué ocurrió, qué esperabas y cómo reproducirlo...',
    subjectPlaceholder: 'Ej: El teclado no responde en Safari',
    successMsg: '¡Reporte enviado! Investigaremos el problema.'
  },
  contacto: {
    title: 'Contacto',
    emoji: '✉️',
    color: 0x5865F2,
    placeholder: 'Escribe tu mensaje...',
    subjectPlaceholder: 'Asunto de tu mensaje',
    successMsg: '¡Mensaje enviado! Te responderemos lo antes posible.'
  }
};

// ─── Mostrar formulario ─────────────────────────
function showDiscordForm(type) {
  const config = DISCORD_CONFIG[type];
  if (!config) return;

  const username = getCurrentUsername();
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  content.innerHTML = `
    <div class="modal-header">
      <span class="discord-form-emoji">${config.emoji}</span>
      <h2>${config.title}</h2>
    </div>
    <div class="discord-form" id="discord-form">
      <div class="form-group">
        <label class="form-label" for="discord-name">Tu nombre</label>
        <input type="text" id="discord-name" class="form-input" 
               value="${escapeHTML(username)}" maxlength="30"
               placeholder="Tu nombre" spellcheck="false">
      </div>
      ${type === 'contacto' ? `
      <div class="form-group">
        <label class="form-label" for="discord-email">Email de contacto <span class="form-optional">(opcional)</span></label>
        <input type="email" id="discord-email" class="form-input" 
               placeholder="tu@email.com" autocomplete="email">
      </div>` : ''}
      <div class="form-group">
        <label class="form-label" for="discord-subject">Asunto</label>
        <input type="text" id="discord-subject" class="form-input" 
               placeholder="${config.subjectPlaceholder}" maxlength="100">
      </div>
      <div class="form-group">
        <label class="form-label" for="discord-message">Mensaje</label>
        <textarea id="discord-message" class="form-input form-textarea" 
                  placeholder="${config.placeholder}" maxlength="1500" rows="5"></textarea>
        <span class="form-charcount"><span id="discord-charcount">0</span>/1500</span>
      </div>
      <div class="form-error" id="discord-error"></div>
      <button class="btn btn-primary" id="discord-submit" onclick="submitDiscordForm('${type}')">
        Enviar
      </button>
    </div>
    <button class="btn btn-ghost modal-close" onclick="hideAllModals()">Cancelar</button>
  `;
  modal.classList.add('active');

  // Contador de caracteres
  const textarea = document.getElementById('discord-message');
  const counter = document.getElementById('discord-charcount');
  textarea.addEventListener('input', () => {
    counter.textContent = textarea.value.length;
  });

  // Focus en asunto
  setTimeout(() => document.getElementById('discord-subject')?.focus(), 150);
}

// ─── Enviar formulario ──────────────────────────
async function submitDiscordForm(type) {
  const config = DISCORD_CONFIG[type];
  const webhook = DISCORD_WEBHOOKS[type];
  const errorEl = document.getElementById('discord-error');
  const submitBtn = document.getElementById('discord-submit');

  const name = document.getElementById('discord-name')?.value?.trim();
  const subject = document.getElementById('discord-subject')?.value?.trim();
  const message = document.getElementById('discord-message')?.value?.trim();
  const emailEl = document.getElementById('discord-email');
  const email = emailEl ? emailEl.value.trim() : '';

  // Validaciones
  if (!name || name.length < 2) {
    errorEl.textContent = 'Introduce tu nombre';
    return;
  }
  if (!subject || subject.length < 3) {
    errorEl.textContent = 'Introduce un asunto';
    return;
  }
  if (!message || message.length < 10) {
    errorEl.textContent = 'El mensaje debe tener al menos 10 caracteres';
    return;
  }

  // Loading
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';
  errorEl.textContent = '';

  // Construir embed de Discord
  const embed = {
    title: `${config.emoji} ${subject}`,
    color: config.color,
    fields: [
      { name: '👤 Usuario', value: name, inline: true },
      { name: '🎮 Tipo', value: type.charAt(0).toUpperCase() + type.slice(1), inline: true }
    ],
    description: message,
    timestamp: new Date().toISOString(),
    footer: { text: 'Wordle Español' }
  };

  if (email) {
    embed.fields.push({ name: '📧 Email', value: email, inline: true });
  }

  // Si está logueado, añadir info
  if (isLoggedIn()) {
    embed.fields.push({ name: '🔑 ID', value: currentUser.id.slice(0, 8) + '...', inline: true });
  }

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Wordle ES',
        avatar_url: 'https://em-content.zobj.net/source/twitter/376/green-square_1f7e9.png',
        embeds: [embed]
      })
    });

    if (response.ok || response.status === 204) {
      hideAllModals();
      showToast(config.successMsg, 2500);
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (e) {
    console.error('Error enviando a Discord:', e);
    errorEl.textContent = 'Error al enviar. Inténtalo de nuevo.';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar';
  }
}
