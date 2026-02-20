# Games Arcade

75+ browser-based games running as individual Docker containers on the web server.

Each game is a self-contained HTML5 application served via nginx reverse proxy at `games.wolfeup.com`.

## Categories

- **Arcade Classics** - Asteroids, Space Invaders, Pac-Man variants, Galaga, Breakout
- **Card & Board** - Solitaire, Chess, Checkers, Blackjack, Backgammon
- **Puzzle** - Wordle, Trivia, Sokoban, Memory, Matching
- **Action** - Tower Defense, Roguelike, Frogger, Snake, Tetris
- **Neon Series** - Custom-built neon-themed games (Pinball, Survivor, Collector, etc.)

## Architecture

Games are deployed as lightweight Docker containers behind a shared nginx reverse proxy. Each container serves a single HTML file with embedded CSS/JS - zero external dependencies.

Container management is handled through the Games Arcade API, which provides health checks, stats, and deployment automation.
