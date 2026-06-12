import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../api/api';
import './UploadPage.css';

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [showroomName, setShowroomName] = useState('');
  const [phone, setPhone] = useState('');
  const [wilaya, setWilaya] = useState('');
  const [consent, setConsent] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length === 0) return;

    if (files.length > 100) {
      setError('Vous pouvez importer au maximum 100 fichiers par analyse.');
      return;
    }

    // Validate file types
    const invalidFiles = files.filter(f => !f.name.toLowerCase().endsWith('.txt'));
    if (invalidFiles.length > 0) {
      setError(`Fichiers invalides: ${invalidFiles.map(f => f.name).join(', ')}. Seuls les fichiers .txt sont acceptés.`);
      return;
    }

    setSelectedFiles(files);
    setError(null);
    setUploadProgress(0);

    try {
      setLoading(true);
      const previewData = await apiService.previewFiles(files);
      setPreview(previewData);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la prévisualisation des fichiers');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!showroomName.trim()) {
      setError('Le nom du showroom est requis');
      return;
    }

    if (!consent) {
      setError('Vous devez accepter les conditions de traitement des données');
      return;
    }

    if (selectedFiles.length === 0) {
      setError('Veuillez sélectionner au moins un fichier');
      return;
    }

    try {
      setLoading(true);
      setUploadProgress(0);
      const result = await apiService.uploadFiles(
        selectedFiles,
        showroomName,
        phone || null,
        wilaya || null,
        consent,
        setUploadProgress,
      );

      // Redirect to result page
      navigate(`/result?token=${encodeURIComponent(result.accessToken)}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du téléchargement des fichiers');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-page">
      <div className="container">
        <div className="upload-card">
          <h1>Importer vos fichiers CCP</h1>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="showroomName">Nom du showroom *</label>
              <input
                id="showroomName"
                type="text"
                value={showroomName}
                onChange={e => setShowroomName(e.target.value)}
                placeholder="Ex: Showroom Alger Centre"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">Téléphone (optionnel)</label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Ex: 0555123456"
              />
            </div>

            <div className="form-group">
              <label htmlFor="wilaya">Wilaya (optionnel)</label>
              <input
                id="wilaya"
                type="text"
                value={wilaya}
                onChange={e => setWilaya(e.target.value)}
                placeholder="Ex: Alger"
              />
            </div>

            <div className="form-group">
              <label htmlFor="files">Fichiers RESULT CCP *</label>
              <div className="file-input-wrapper">
                <input
                  id="files"
                  type="file"
                  multiple
                  accept=".txt"
                  onChange={handleFileSelect}
                  disabled={loading}
                />
                <span className="file-input-label">
                  {selectedFiles.length > 0
                    ? `${selectedFiles.length} fichier(s) sélectionné(s)`
                    : 'Cliquez pour sélectionner ou glissez-déposez'}
                </span>
              </div>
              <p className="file-hint">
                Accepte 1 à 100 fichiers .txt. Plus de 30 fichiers sont supportés. Maximum 50 Mo.
              </p>
            </div>

            {preview && (
              <div className="preview-summary">
                <h3>Aperçu des données</h3>
                <div className="preview-grid">
                  <div className="preview-item">
                    <span>Fichiers:</span>
                    <strong>{preview.fileCount}</strong>
                  </div>
                  <div className="preview-item">
                    <span>Total lignes:</span>
                    <strong>{preview.totalLines.toLocaleString('fr-FR')}</strong>
                  </div>
                  <div className="preview-item">
                    <span>Lignes invalides:</span>
                    <strong>{preview.invalidLines}</strong>
                  </div>
                  <div className="preview-item">
                    <span>Montant encaissé:</span>
                    <strong>
                      {Number(preview.collectedAmount).toLocaleString('fr-FR', {
                        style: 'currency',
                        currency: 'DZD',
                      })}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div className="consent-section">
              <h3>Consentement et données</h3>
              <div className="consent-text">
                <p>
                  En important ces fichiers, je confirme que je suis autorisé à traiter ces
                  données dans le cadre de mon activité commerciale.
                </p>
                <p>
                  J'accepte que CCP Analyzer DZ analyse et stocke les données CCP importées afin
                  de générer des rapports, des statistiques et des indicateurs de risque.
                </p>
                <p>
                  Les comptes CCP seront masqués dans l'interface et utilisés de manière sécurisée
                  pour l'analyse.
                </p>
              </div>

              <label className="consent-checkbox">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={e => setConsent(e.target.checked)}
                />
                J'ai lu et j'accepte les conditions d'analyse et de traitement des données.
              </label>

              <p className="consent-note">
                CCP Analyzer DZ ne partage pas vos fichiers avec d'autres showrooms. Les données
                sont utilisées pour générer votre rapport et améliorer les indicateurs de risque.
              </p>
            </div>

            {error && <div className="error-message">{error}</div>}

            {loading && uploadProgress > 0 && (
              <div className="upload-progress" aria-label="Progression de l'import">
                <div className="upload-progress-bar">
                  <span style={{ width: `${uploadProgress}%` }} />
                </div>
                <strong>{uploadProgress}%</strong>
              </div>
            )}

            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? 'Traitement en cours...' : 'Analyser les fichiers'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
