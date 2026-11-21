# Design

## Decisions

1. **Defaults in the client form, not the contract.** `TokenStats` allows null, and `token.create` defaults to `EMPTY_STATS`. Changing that would change a shared schema (ADR plus Real-Time Architecture review) and would also affect server-side creation paths such as creature placement. The requirement is about the GM's Add token form, so `statsWithDefaults` runs there just before the draft goes to the board.
2. **One pure helper.** `statsWithDefaults(stats)` in `panels/tokenDefaults.ts`: `maxHp = maxHp ?? (hp >= 1 ? hp : 100)`, `hp = hp ?? maxHp`, `ac = ac ?? 0`. It never overrides a typed value, so "HP above Max HP" is still rejected by `decide` as before.
3. **Placeholders show the outcome.** HP's placeholder follows Max HP when typed, else 100; Max HP shows 100; AC shows 0. A hint line states the rule, so a blank field isn't mistaken for "no stats".
4. **Native `<details>` for Advanced settings**, styled like the Attack section's Custom roll. Collapsed each time the form opens. The `required` Size and Rotation inputs keep their valid defaults, so a collapsed section never blocks submit.
