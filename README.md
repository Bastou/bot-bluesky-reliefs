# Bot Bluesky Reliefs

A Deno-based bot that generates and posts daily visualizations of terrain elevation data from random global locations on Bluesky. Users can request specific locations by commenting coordinates on the bot's latest post. 

<p align="center">
  <img src="cover.png" alt="Bot Bluesky Reliefs Cover" width="360" />
  <br>
  <small><em>Mont Blanc (45.8326° N, 6.8652° E)</em></small>
</p>

## Requirements

- [Deno v1.40+](https://deno.land/) 
- API key for elevation service (see Configuration)
- Bluesky account with app password

## Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/bot-bluesky-reliefs.git
cd bot-bluesky-reliefs
```

2. Create a `.env` file based on the `.env.example` template and fill in your API keys and credentials.

## Configuration

The bot can be configured through environment variables or by editing the configuration in `src/config/config.ts`.

## Usage

### Running the Bot

To start the bot with default settings:

```
deno task start
```


For development with automatic reloading:

```
deno task dev
```

## How to Request Locations on bluesky

Reply to any bot post with coordinates in the format lat,long: 45.8326, 6.8652 / 48,12 / 45.76402096632121, 4.835661483558657

License
MIT

## License

MIT
