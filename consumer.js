const { Kafka } = require('kafkajs');
const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/kafkaDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const messageSchema = new mongoose.Schema({
  value: String,
  createdAt: { type: Date, default: Date.now },
});

const Message = mongoose.model('Message', messageSchema);

const kafka = new Kafka({
  clientId: 'my-app',
  brokers: ['localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'test-group' });

const run = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: 'test-topic', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const value = message.value.toString();
      const newMessage = new Message({ value });
      await newMessage.save();
      console.log('Message enregistré :', value);
    },
  });
};

run().catch(console.error);
