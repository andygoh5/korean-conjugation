# Korean Conjugation Practice
A web app for practicing Korean verb and adjective conjugations with basic spaced repetition.

# About the code
The website design code is based on https://github.com/baileysnyder/japanese-conjugation under GPL-3.0, and the Korean conjugation logic under `src/korean/` is from https://github.com/max-christian/korean_conjugation under AGPL-3.0. The latter was modified minimally to avoid using `with()` and `require()` statements, along with adding `let`s for variable declaration.

## Build Setup
```bash
# install dependencies
$ npm install

# serve with hot reload at localhost:1234
$ npm run dev

# build for production
# minifies and outputs into /dist
$ npm run build

# build and test on local server 
$ ./build_and_serve.sh
```