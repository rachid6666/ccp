import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiService, SessionResult } from '../api/api';
import './ResultPage.css';

export const ResultPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [result, setResult] = useState<SessionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  useEffect(() => {
    const fetchResult = async () => {
      if (!token) {
        setError('Token manquant');
        setLoading(false);
        return;
      }

      try {
        const sessionResult = await apiService.getSessionResult(token);
        setResult(sessionResult);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Erreur lors du chargement des résultats');
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [token]);

  const handleDownload = async (name: string, downloadFn: (token: string) => Promise<void>) => {
    if (!token) return;
    try {
      setDownloadingFile(name);
      await downloadFn(token);
    } catch (err) {
      alert('Erreur lors du téléchargement du fichier');
    } finally {
      setDownloadingFile(null);
    }
  };

  if (loading) {
    return (
      <div className="result-page">
        <div className="container">
          <div className="loading">Chargement des résultats...</div>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="result-page">
        <div className="container">
          <div className="error-message">{error || 'Erreur lors du chargement'}</div>
        </div>
      </div>
    );
  }

  const collectionRate = Number(result.collectionRate || 0).toFixed(2);

  return (
    <div className="result-page">
      <div className="container">
        <div className="result-header">
          <h1>Rapport CCP généré</h1>
          <p>Votre analyse est prête. Vous pouvez télécharger les fichiers Excel ci-dessous.</p>
        </div>

        <div className="kpi-cards">
          <div className="kpi-card">
            <span className="kpi-label">Nombre de fichiers analysés</span>
            <span className="kpi-value">{result.fileCount}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Nombre total de lignes</span>
            <span className="kpi-value">{result.totalLines.toLocaleString('fr-FR')}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Lignes invalides</span>
            <span className="kpi-value">{result.invalidLines}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Montant total tenté</span>
            <span className="kpi-value">
              {Number(result.attemptedAmount).toLocaleString('fr-FR', {
                style: 'currency',
                currency: 'DZD',
              })}
            </span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Montant encaissé</span>
            <span className="kpi-value">
              {Number(result.collectedAmount).toLocaleString('fr-FR', {
                style: 'currency',
                currency: 'DZD',
              })}
            </span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Montant échoué</span>
            <span className="kpi-value">
              {Number(result.failedAmount).toLocaleString('fr-FR', {
                style: 'currency',
                currency: 'DZD',
              })}
            </span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Taux d'encaissement</span>
            <span className="kpi-value">{collectionRate}%</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Clients avec échec</span>
            <span className="kpi-value">{result.failedClientCount}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Clients à suivre</span>
            <span className="kpi-value">{result.followUpClientCount}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Clients à risque</span>
            <span className="kpi-value">{result.riskyClientCount}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Clients à bloquer</span>
            <span className="kpi-value">{result.blockCandidateCount}</span>
          </div>
        </div>

        <div className="download-section">
          <h2>Télécharger les rapports Excel</h2>
          <div className="download-buttons">
            <button
              onClick={() => handleDownload('summary', apiService.downloadSummaryXls)}
              disabled={downloadingFile !== null}
              className="download-btn"
            >
              {downloadingFile === 'summary'
                ? 'Téléchargement...'
                : 'Télécharger le résumé Excel'}
            </button>
            <button
              onClick={() => handleDownload('failed', apiService.downloadFailedClientsXls)}
              disabled={downloadingFile !== null}
              className="download-btn"
            >
              {downloadingFile === 'failed'
                ? 'Téléchargement...'
                : 'Télécharger les clients échoués'}
            </button>
            <button
              onClick={() => handleDownload('followup', apiService.downloadFollowUpXls)}
              disabled={downloadingFile !== null}
              className="download-btn"
            >
              {downloadingFile === 'followup'
                ? 'Téléchargement...'
                : 'Télécharger les clients à suivre'}
            </button>
            <button
              onClick={() => handleDownload('risky', apiService.downloadRiskyClientsXls)}
              disabled={downloadingFile !== null}
              className="download-btn"
            >
              {downloadingFile === 'risky'
                ? 'Téléchargement...'
                : 'Télécharger les clients à risque'}
            </button>
            <button
              onClick={() => handleDownload('blocklist', apiService.downloadBlockListXls)}
              disabled={downloadingFile !== null}
              className="download-btn"
            >
              {downloadingFile === 'blocklist'
                ? 'Téléchargement...'
                : 'Télécharger la liste de blocage'}
            </button>
            <button
              onClick={() => handleDownload('allclean', apiService.downloadAllCleanXls)}
              disabled={downloadingFile !== null}
              className="download-btn"
            >
              {downloadingFile === 'allclean'
                ? 'Téléchargement...'
                : 'Télécharger toutes les lignes nettoyées'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
