# Système de Traitement de Flux de Données en Temps Réel

Ce projet implémente un système de traitement de flux de données utilisant Apache Kafka comme middleware de messagerie, Node.js pour la production et consommation de messages, et MongoDB pour le stockage persistant.

## Description du Projet

L'application se compose de trois services principaux :
- Un **générateur de messages** qui publie des données vers un topic Kafka
- Un **service consommateur** qui traite les messages et les persiste dans MongoDB
- Une **API REST** qui expose les données stockées via des endpoints HTTP

## Prérequis Techniques

### Environnement de Développement
- **JDK 8+** : Requis pour exécuter Kafka
- **Node.js 16+** : Pour les applications serveur
- **MongoDB Community Edition** : Pour le stockage persistant
- **Apache Kafka 3.9.0** : Pour la gestion des flux de données

## Installation et Configuration

### 1. Configuration de Kafka

#### Téléchargement
Téléchargez [Apache Kafka 3.9.0](https://kafka.apache.org/downloads)

#### Démarrage de l'environnement Kafka
Lancez Zookeeper (service de coordination) :
```bash
# Premier terminal
cd [kafka-directory]
bin\windows\zookeeper-server-start.bat config\zookeeper.properties
```

Démarrez le broker Kafka :
```bash
# Second terminal
cd [kafka-directory]
bin\windows\kafka-server-start.bat config\server.properties
```

Création d'un canal de communication (topic) :
```bash
cd [kafka-directory]
bin\windows\kafka-topics.bat --create --topic data-stream --bootstrap-server localhost:9092
```

### 2. Configuration de MongoDB
Assurez-vous que le service MongoDB est actif et accessible à l'adresse `mongodb://localhost:27017`

### 3. Installation du Projet Node.js

```bash
# Créer le répertoire du projet
mkdir realtime-data-processing
cd realtime-data-processing

# Initialiser le projet Node.js
npm init -y

# Installer les dépendances
npm install express mongoose kafkajs
```

## Structure du Projet

```
realtime-data-processing/
├── src/
│   ├── producer.js       # Service de génération de messages
│   ├── consumer.js       # Service de consommation et stockage
│   ├── api.js            # Service API REST
│   └── models/
│       └── message.js    # Modèle de données MongoDB
├── package.json
└── README.md
```

## Architecture du Système

```
┌────────────┐    ┌─────────────┐    ┌────────────┐    ┌────────────┐    ┌───────────┐
│  Producer  │───►│ Kafka Topic │───►│  Consumer  │───►│  MongoDB   │◄───│ REST API  │
└────────────┘    └─────────────┘    └────────────┘    └────────────┘    └───────────┘
```

## Implémentation des Composants

### 1. Modèle de Données (models/message.js)

```javascript
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', messageSchema);
```

### 2. Producteur (producer.js)

```javascript
const { Kafka } = require('kafkajs');

// Configuration Kafka
const kafka = new Kafka({
  clientId: 'data-producer',
  brokers: ['localhost:9092']
});

const producer = kafka.producer();

// Fonction de génération de messages
async function startProducing() {
  try {
    await producer.connect();
    console.log('Producteur connecté à Kafka');
    
    // Génération de messages à intervalle régulier
    setInterval(async () => {
      const message = {
        value: JSON.stringify({
          text: `Message généré à ${new Date().toISOString()}`,
          source: 'system-generator'
        })
      };
      
      await producer.send({
        topic: 'data-stream',
        messages: [message]
      });
      
      console.log('Message envoyé:', message.value);
    }, 1000); // Envoie un message chaque seconde
    
  } catch (error) {
    console.error('Erreur producteur:', error);
  }
}

// Gestion propre de la fermeture
const shutdown = async () => {
  await producer.disconnect();
  console.log('Producteur déconnecté');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Démarrage du producteur
startProducing().catch(console.error);
```

### 3. Consommateur (consumer.js)

```javascript
const { Kafka } = require('kafkajs');
const mongoose = require('mongoose');
const Message = require('./models/message');

// Connexion à MongoDB
mongoose.connect('mongodb://localhost:27017/messageDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connecté à MongoDB');
}).catch(err => {
  console.error('Erreur de connexion MongoDB:', err);
  process.exit(1);
});

// Configuration Kafka
const kafka = new Kafka({
  clientId: 'data-consumer',
  brokers: ['localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'message-processing-group' });

// Fonction de consommation de messages
async function startConsuming() {
  try {
    await consumer.connect();
    console.log('Consommateur connecté à Kafka');
    
    await consumer.subscribe({ topic: 'data-stream', fromBeginning: true });
    
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const messageContent = JSON.parse(message.value.toString());
          console.log(`Message reçu: ${JSON.stringify(messageContent)}`);
          
          // Stockage dans MongoDB
          const newMessage = new Message({
            content: messageContent.text,
            timestamp: new Date()
          });
          
          await newMessage.save();
          console.log('Message sauvegardé dans MongoDB');
        } catch (err) {
          console.error('Erreur lors du traitement du message:', err);
        }
      }
    });
  } catch (error) {
    console.error('Erreur consommateur:', error);
  }
}

// Gestion propre de la fermeture
const shutdown = async () => {
  await consumer.disconnect();
  await mongoose.connection.close();
  console.log('Consommateur déconnecté et connexion MongoDB fermée');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Démarrage du consommateur
startConsuming().catch(console.error);
```

### 4. API REST (api.js)

```javascript
const express = require('express');
const mongoose = require('mongoose');
const Message = require('./models/message');

// Connexion à MongoDB
mongoose.connect('mongodb://localhost:27017/messageDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('API connectée à MongoDB');
}).catch(err => {
  console.error('Erreur de connexion MongoDB dans l\'API:', err);
  process.exit(1);
});

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration middleware
app.use(express.json());

// Route pour récupérer tous les messages
app.get('/messages', async (req, res) => {
  try {
    const messages = await Message.find()
      .sort({ timestamp: -1 }) // Tri par date descendante
      .limit(100);             // Limite à 100 messages
    
    res.json({
      count: messages.length,
      data: messages
    });
  } catch (err) {
    console.error('Erreur lors de la récupération des messages:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la récupération des messages' });
  }
});

// Route pour récupérer un message par son ID
app.get('/messages/:id', async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({ error: 'Message non trouvé' });
    }
    
    res.json(message);
  } catch (err) {
    console.error('Erreur lors de la récupération du message:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la récupération du message' });
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`API REST démarrée sur le port ${PORT}`);
});

// Gestion propre de la fermeture
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('Connexion MongoDB fermée dans l\'API');
  process.exit(0);
});
```

## Démarrage du Système

1. **Démarrer le producteur** :
   ```bash
   node src/producer.js
   ```

2. **Démarrer le consommateur** :
   ```bash
   node src/consumer.js
   ```

3. **Démarrer l'API REST** :
   ```bash
   node src/api.js
   ```

## Test du Système

1. **Vérifier les logs du producteur** pour confirmer l'envoi des messages
2. **Vérifier les logs du consommateur** pour confirmer la réception et le stockage des messages
3. **Interroger l'API** pour accéder aux messages stockés :
   ```bash
   curl http://localhost:3000/messages
   ```
   Ou ouvrir cette URL dans un navigateur web

## Extensions Possibles

- Ajout d'une interface utilisateur pour visualiser les données en temps réel
- Implémentation d'un traitement plus avancé des messages (filtrage, transformation)
- Ajout de métriques et de surveillance pour le système
- Conteneurisation de l'application avec Docker pour un déploiement simplifié
- Ajout d'un second consommateur pour analyser les données en parallèle

## Résolution de Problèmes

### Kafka ne démarre pas
- Vérifiez que Java est correctement installé : `java -version`
- Assurez-vous que Zookeeper est en cours d'exécution avant de démarrer Kafka
- Vérifiez les ports utilisés (9092 pour Kafka, 2181 pour Zookeeper)

### Messages non reçus par le consommateur
- Vérifiez que le topic a été correctement créé : `bin\windows\kafka-topics.bat --list --bootstrap-server localhost:9092`
- Assurez-vous que le producteur et le consommateur utilisent le même nom de topic

### Problèmes de connexion à MongoDB
- Vérifiez que MongoDB est en cours d'exécution : `mongosh`
- Vérifiez l'URL de connexion dans les fichiers consumer.js et api.js
