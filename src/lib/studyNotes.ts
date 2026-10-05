import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

export interface StudyNoteItem {
  id: string;
  userId: string;
  question: string;
  answer: string;
  topic?: string;
  isSaved: boolean;
  createdAt: string;
  updatedAt: string;
}

const COLLECTION_NAME = 'studyNotes';

/**
 * Save a new question and answer to the user's study notes
 */
export async function saveStudyNote(
  userId: string,
  question: string,
  answer: string,
  topic: string = 'General',
  isSaved: boolean = false
): Promise<string> {
  // Generate valid ID containing only letters, numbers, and hyphens
  const noteId = `note-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const docRef = doc(db, COLLECTION_NAME, noteId);
  const now = new Date().toISOString();

  const noteData: Record<string, any> = {
    userId,
    question: question.trim().slice(0, 2000),
    answer: answer.slice(0, 30000),
    isSaved: Boolean(isSaved),
    createdAt: now,
    updatedAt: now,
  };

  if (topic) {
    noteData.topic = topic.slice(0, 100);
  }

  try {
    await setDoc(docRef, noteData);
    return noteId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${COLLECTION_NAME}/${noteId}`);
  }
}

/**
 * Toggle bookmark / saved status for a study note
 */
export async function toggleBookmarkNote(noteId: string, currentStatus: boolean): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, noteId);
  const now = new Date().toISOString();

  try {
    await updateDoc(docRef, {
      isSaved: !currentStatus,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${noteId}`);
  }
}

/**
 * Delete a study note from Firestore
 */
export async function removeStudyNote(noteId: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, noteId);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${noteId}`);
  }
}

/**
 * Real-time listener for current user's study notes
 */
export function subscribeToUserNotes(
  userId: string,
  onUpdate: (notes: StudyNoteItem[]) => void,
  onError?: (err: Error) => void
): () => void {
  const notesQuery = query(
    collection(db, COLLECTION_NAME),
    where('userId', '==', userId)
  );

  const unsubscribe = onSnapshot(
    notesQuery,
    (snapshot) => {
      const items: StudyNoteItem[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          userId: data.userId,
          question: data.question,
          answer: data.answer,
          topic: data.topic,
          isSaved: Boolean(data.isSaved),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });

      // Sort newest first
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(items);
    },
    (error) => {
      console.error('Notes snapshot error:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
    }
  );

  return unsubscribe;
}
