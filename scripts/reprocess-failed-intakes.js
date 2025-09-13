const { Firestore } = require('@google-cloud/firestore');
const firestore = new Firestore();

async function reprocessFailedIntakes() {
  console.log('Starting to re-process failed intakes...');

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  const snapshot = await firestore
    .collection('patient_intake_queue')
    .where('status', 'in', ['error', 'processing'])
    .get();

  if (snapshot.empty) {
    console.log('No failed or stuck intakes to re-process.');
    return;
  }

  console.log(`Found ${snapshot.size} failed or stuck intakes to re-process.`);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.status === 'error' || (data.status === 'processing' && data.processingStarted.toDate() < fifteenMinutesAgo)) {
      console.log(`Re-queueing intake ${doc.id}`);
      await doc.ref.update({
        status: 'pending',
        error: null,
        errorAt: null,
        processingStarted: null,
      });
    }
  }

  console.log('Finished re-processing failed intakes.');
}

reprocessFailedIntakes().catch(console.error);