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
        await this.update(updateData);
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
                  staminaToHeal = Math.min(this.system.attributes.hp.sp.max - stamina, remainingHealingAfterHP);
                  if (staminaToHeal > 0) {
                    updateData['system.attributes.hp.sp.value'] = stamina + staminaToHeal;
                    console.log(`Healing Stamina: ${staminaToHeal}`);
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
                  content: messageContent
                });
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
