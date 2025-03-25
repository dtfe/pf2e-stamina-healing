# Pathfinder 2e Stamina Healing
 
This module aims to accomplish a single task. It allows overhealing to carry over to stamina.

This requires libwrapper and the stamina variant rule to be activated.

This is my first module and I am eager to hear from anyone who might have some suggestions to improve the code / add additional features.

**Wanted features:**
- **Better way to handle healing-received modifiers:** Currently only number value modifiers and ones with @spell.rank are added to the calculation. I couldn't figure out if there is a way to automatically do these calculations. I also don't know if the healing-received modifier total is around or where it is if there is one so I had to implement my own calculations for the modifier which isn't ideal.