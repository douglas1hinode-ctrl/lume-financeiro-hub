#!/bin/bash
set -e

echo "🚀 Iniciando deploy do Lume Financeiro Hub..."

# Verifica se o .env existe
if [ ! -f .env ]; then
  echo "❌ Arquivo .env não encontrado!"
  echo "   Copie o .env.example e preencha com suas credenciais:"
  echo "   cp .env.example .env"
  exit 1
fi

# Atualiza o código
echo "📥 Baixando atualizações..."
git pull origin main

# Para o container atual (se existir)
echo "⏹️  Parando container atual..."
docker compose down

# Reconstrói a imagem e sobe
echo "🔨 Reconstruindo imagem..."
docker compose build --no-cache

echo "▶️  Subindo container..."
docker compose up -d

echo ""
echo "✅ Deploy concluído! Aplicação rodando em http://$(hostname -I | awk '{print $1}'):80"
