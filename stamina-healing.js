// scripts/stamina-healing.js

Hooks.on('ready', () => {
  // Ensure libWrapper is available
  if (!game.modules.get('lib-wrapper')?.active) {
    ui.notifications.error("PF2E Stamina Healing requires the 'libWrapper' module. Please install and activate it.");
    return;
  }

  // Hook into the actor's applyDamage method to modify healing logic
  libWrapper.register('pf2e-stamina-healing', 'CONFIG.Actor.documentClass.prototype.applyDamage', async function (wrapped, damage, token, updateData = {}, options = {}) {
    const hp = this.system.attributes.hp;
    const stamina = this.system.attributes.hp.sp.value;

    console.log("applyDamage called with damage:", damage.damage);

    // Check if damage is negative (healing)
    if (damage.damage < 0) {
      const remainingHealing = -damage.damage;
      const hpToHeal = Math.min(hp.max - hp.value, remainingHealing);
      let remainingHealingAfterHP = remainingHealing - hpToHeal;

      if (remainingHealingAfterHP <= 0) {
        // Automatically choose "no" if there's no remaining healing
        await this.update(updateData);

        // Create a chat message to inform everyone about the healing
        let messageContent = `${this.name} heals ${hpToHeal} HP`;
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this }),
          content: messageContent
        });
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
