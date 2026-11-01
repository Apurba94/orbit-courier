# Orbit Courier

A physics delivery game for phones. Drag back to fling a parcel ship, then let real inverse-square gravity bend its path around planets
and into the dock.

**[Play it now](https://apurba94.github.io/orbit-courier/)** in your phone's browser, then use "Add to Home Screen" to install it. After the
first visit it works offline.

* 40 deliveries across 4 sectors, with planets, asteroids, orbiting moons and gates to pass through.
* A short aim line shows the start of your flight, so a good shot still takes judgement.
* Short burns adjust a flight in the air, at the cost of a star.
* After three failed tries, a hint shows the start of a route that works.
* Three-star ratings and a best score for every delivery.

No ads, no accounts, no tracking and no network use after the first load.

## Run from source

```bash
npx serve .
npm test
```

Plain JavaScript with no dependencies. `src/logic.js` holds the physics and level generation, and `src/main.js` holds the screens.

## How it is tested

The tests check the physics, including that a circular orbit stays circular. Each level is generated around a real flight: crates and
gates sit on that path, and the tests replay it on all 40 levels to prove that three stars can be earned on every one.

## License

MIT
