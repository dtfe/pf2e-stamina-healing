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
      let remainingHealing = -damage.damage;


      // HP calculations
      const hpToHeal = Math.min(hp.max - hp.value, remainingHealing);
      console.log(hpToHeal, "hp to heal")
      if (hpToHeal > 0) {
        remainingHealing -= hpToHeal;
        console.log(`Healing HP: ${hpToHeal}, Remaining healing: ${remainingHealing}`);
      }

      // Apply remaining healing to stamina
      if (remainingHealing > 0) {
        const staminaToHeal = Math.min(this.system.attributes.hp.sp.max - stamina, remainingHealing);
        console.log("stamina to heal", staminaToHeal, ". Current Stamina: ", stamina)
        if (staminaToHeal > 0) {
          updateData['system.attributes.hp.sp.value'] = stamina + staminaToHeal;
          console.log(`Healing Stamina: ${staminaToHeal}`);
        }
      }

      this.update(updateData);

      
    }

    

    // Call the original method for regular damage handling
    return wrapped(damage, token, updateData, options);
  }, 'MIXED');
});
