# Design

## Decisions

1. **Who, what, roll, result.** The order follows the task. The result moves below the controls because it's read after rolling.
2. **One `Picker` for all three dropdowns.** Attacker, target and attack share `ui/Picker.tsx`: a WAI-ARIA select-only combobox (a `role="combobox"` button, a `role="listbox"` list, `aria-activedescendant`). Each option shows a bold label and muted detail (turn, distance, dice), which a native `<select>` can't style. Keys: arrows, Home and End move; Enter or Space picks; Escape and Tab close.
3. **Attacker and target on two lines.** At sidebar width (~18rem), one line truncated both names to a letter. The attacker takes the first line. The target and Pick on board share the second.
4. **Less-used actions in a ⋯ menu.** Edit, Add attack and Custom roll move into a `PopoverButton` menu, so only the controls used every turn stay visible. Adding the first attack is the exception: with no attacks, **Add an attack** is the main control.
5. **Private toggle beside Roll.** An `aria-pressed` eye button next to the Roll button, amber when on. Privacy is decided where the roll is made. The setting still lives in the room page, so it isn't quietly reset.
6. **Result text from one helper.** `attackHeadline(roll)` gives "7 damage" / "17 to hit" and "label · dice · attacker → target". The card uses it, and a later board popup can reuse it.
