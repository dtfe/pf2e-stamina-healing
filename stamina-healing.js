// scripts/stamina-healing.js
function evaluateModifierExpression(expression, context) {
  try {
      // Replace placeholders with actual values
      for (let key in context) {
          let value = context[key];

          // Ensure the value is a number (extract .value if it's an object)
          if (typeof value == "object" && value != null && "value" in value) {
              value = value.value;
          }
          
          if (typeof value != "number") {
              console.warn(`Invalid context value for ${key}:`, value);
              value = 1; // Default fallback
          }

          let regex = new RegExp(`@${key.replace('.', '\\.')}`, "g"); // Escape dot notation
          expression = expression.replace(regex, value);
      }

      // Safely evaluate the math expression
      return new Function(`return ${expression};`)();
  } catch (error) {
      console.warn(`Error evaluating expression: ${expression}`, error);
      return 0; // Default fallback
  }
}

Hooks.on('ready', () => {
  // Ensure libWrapper is available
  if (!game.modules.get('lib-wrapper')?.active) {
    ui.notifications.error("PF2E Stamina Healing requires the 'libWrapper' module. Please install and activate it.");
    return;
  }
  
  
  // Hook into the actor's applyDamage method to modify healing logic
  libWrapper.register('pf2e-stamina-healing', 'CONFIG.Actor.documentClass.prototype.applyDamage', async function (wrapped, damage, token, updateData = {}, options = {}) {
    if (this.system.attributes.hp.sp === undefined){
      return wrapped(damage, token, updateData, options);
    }
    const hp = this.system.attributes.hp;
    const stamina = this.system.attributes.hp.sp.value;

    console.log("applyDamage called with damage:", damage.damage);

    
    const actor = this;
    console.log(actor);


    // Check if damage is negative (healing)
    if (damage.damage < 0) {
            // Retrieve all healing modifiers dynamically
            let totalHealingModifier = 0;

            // Loop through all active items (feats, spells, effects, potions)
            for (let item of actor.items) {
                if (!item.system.rules) continue;

                for (let rule of item.system.rules) {
                    if (rule.selector == "healing-received" && rule.key == "FlatModifier") {
                        let rawValue = rule.value;
                        let modifierValue = 0;

                        if (typeof rawValue == "number") {
                            modifierValue = rawValue;  // Direct number value
                            console.log("RawValue")
                        } else if (typeof rawValue == "string") {
                            // Extract spell rank
                            let spellRank = 1;
                            if (item.system.level && typeof item.system.level == "object" && "value" in item.system.level) {
                                spellRank = item.system.level.value;
                            } else if (typeof item.system.level == "number") {
                                spellRank = item.system.level;
                            }

                            let context = {
                                "spell.rank": spellRank,
                            };

                            // Evaluate the formula using our custom function
                            modifierValue = evaluateModifierExpression(rule.value, context);
                        }

                        console.log(`Found Healing Modifier: ${modifierValue} from ${item.name}`);
                        totalHealingModifier += modifierValue;
                    }
                }
            }
      console.log(totalHealingModifier);
      const remainingHealing = -(damage.damage - totalHealingModifier);
      const hpToHeal = Math.min(hp.max - hp.value, remainingHealing);
      let remainingHealingAfterHP = remainingHealing - hpToHeal;

      if (remainingHealingAfterHP <= 0) {
        // Automatically choose "no" if there's no remaining healing
        return wrapped(damage, token, updateData, options);
      } else {
        // Prompt the user if they want to apply remaining healing to stamina
        new Dialog({
          title: "Apply Healing",
          content: `<p>Do you want to apply remaining healing (${remainingHealingAfterHP}) to stamina?</p>`,
          buttons: {
            yes: {
              icon: "<i class='fas fa-check'></i>",
              label: "Yes",
              callback: async () => {
                let staminaToHeal = 0;

                if (remainingHealingAfterHP > 0) {
                  options.createMessage = false;
                  staminaToHeal = Math.min(this.system.attributes.hp.sp.max - stamina, remainingHealingAfterHP);
                  if (staminaToHeal > 0) {
                    updateData['system.attributes.hp.sp.value'] = stamina + staminaToHeal;
                    let renderedToken = null;

                    // 1. Use passed-in token (from applyDamage)
                    if (token?.object) {
                      renderedToken = token.object;
                    
                    // 2. Try actor’s active tokens
                    } else {
                      const fallback = actor.getActiveTokens(true)[0];
                      if (fallback?.object) {
                        renderedToken = fallback.object;
                    
                    // 3. Last resort: scan visible scene tokens
                      } else {
                        const fromScene = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
                        if (fromScene) {
                          renderedToken = fromScene;
                        }
                      }
                    }
                    
                    if (renderedToken) {
                      showFancyFloatingStaminaText(renderedToken, staminaToHeal);
                    } else {
                      console.warn("No rendered token found to show stamina floating text.");
                    }
                    
                  }
                }

                await this.update(updateData);

                // Create a chat message to inform everyone about the healing
                let messageContent = `Heals for ${hpToHeal} HP and recovers `
                if (hpToHeal == 0){
                  messageContent = `Recovers `;
                }
                if (staminaToHeal > 0) {
                  messageContent += `${staminaToHeal} stamina`;
                }
                if (messageContent == `Recovers `){
                  messageContent = `${this.name} is at full health.`
                }
                ChatMessage.create({
                  speaker: ChatMessage.getSpeaker({ actor: this }),
                  content: `${messageContent}<br><button class="revert-healing" data-actor-id="${this.id}" data-hp="${hpToHeal}" data-sp="${staminaToHeal}">Revert Healing</button>`
                });
                return;
              }
            },
            no: {
              icon: "<i class='fas fa-times'></i>",
              label: "No",
              callback: async () => {
                await this.update(updateData);
              }
            }
          },
          default: "yes"
        }).render(true);
      }
    }

    // Call the original method for regular damage handling
    return wrapped(damage, token, updateData, options);
  }, 'MIXED');
});

Hooks.on("renderChatMessage", (message, html) => {
  html.find("button.revert-healing").click(async (ev) => {
    const button = ev.currentTarget;

    // Disable the button visually
    button.disabled = true;
    button.innerText = "Healing Reverted";
    button.style.opacity = "0.5";
    button.style.cursor = "not-allowed";

    const actorId = button.dataset.actorId;
    const hp = parseInt(button.dataset.hp);
    const sp = parseInt(button.dataset.sp);
    const actor = game.actors.get(actorId);

    if (!actor) {
      ui.notifications.warn("Could not find actor to revert healing.");
      return;
    }

    const updates = {};
    if (!isNaN(hp) && hp > 0) {
      updates["system.attributes.hp.value"] = Math.max(actor.system.attributes.hp.value - hp, 0);
    }
    if (!isNaN(sp) && sp > 0) {
      updates["system.attributes.hp.sp.value"] = Math.max(actor.system.attributes.hp.sp.value - sp, 0);
    }

    await actor.update(updates);

    // Parse only the original message content (not full HTML!)
    const parser = new DOMParser();
    const doc = parser.parseFromString(message.content, "text/html");

    // Remove the button from the parsed content
    const buttonEl = doc.querySelector("button.revert-healing");
    if (buttonEl) buttonEl.remove();

    // Get the cleaned-up inner content
    const remainingContent = doc.body.innerHTML.trim();

    // Wrap the content in <s> if it's not already
    const struckContent = `<s>${remainingContent}</s>`;

    // Update the message content with strikethrough
    await message.update({ content: struckContent });



    // Optional: Create a confirmation chat message
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `Reverted ${hp > 0 ? `${hp} HP` : ""}${hp > 0 && sp > 0 ? " and " : ""}${sp > 0 ? `${sp} Stamina` : ""} healing.`
    });
  });
});

function showFancyFloatingStaminaText(token, amount) {
  if (!token) return;

  const text = new PIXI.Text(`+${amount}`, {
    fontFamily: "Signika",
    fontSize: 28,
    fill: "#33ccff",
    stroke: "#003344",
    strokeThickness: 4
  });

  text.anchor.set(0.5);
  text.x = token.center.x;
  text.y = token.center.y - 20;
  text.alpha = 0;
  text.scale.set(0.3); // Start small

  text.zIndex = 1000;
  canvas.interface.addChild(text);
  canvas.interface.sortChildren();

  // Timing setup
  const growDuration = 400;
  const floatDuration = 1400;
  const totalDuration = growDuration + floatDuration;
  const floatDistance = 70;

  const startTime = performance.now();
  const startY = text.y;

  // Easing functions
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeInCubic = t => t * t * t;


  const easeInQuad = t => t * t;

  function animate(now) {
    const elapsed = now - startTime;

    if (elapsed >= totalDuration) {
      canvas.interface.removeChild(text);
      return;
    }

    // Phase 1: Fade in and scale up
    if (elapsed <= growDuration) {
      const p = easeOutCubic(elapsed / growDuration);
      text.alpha = p;
      text.scale.set(0.3 + p * 0.5); // 0.5 → 1.0
    }

    // Phase 2: Float upward and fade out
    else {
      const t = (elapsed - growDuration) / floatDuration;

      const moveP = easeInQuad(t);  // quick ease-in float
      text.y = startY - moveP * floatDistance;

      const fadeP = easeInCubic(t);
      text.alpha = 1 - fadeP;

      text.scale.set(0.8);             // stays full size
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}



