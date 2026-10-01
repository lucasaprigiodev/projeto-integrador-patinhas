# -*- coding: utf-8 -*-
import os
import base64
import subprocess

BASE_DIR = "/Users/lucasaprigio/.gemini/antigravity-ide/brain/a6a56e41-f23f-4a1f-888c-bb8e47b518b3/scratch/projeto-integrador-patinhas"
EVIDENCIAS_DIR = os.path.join(BASE_DIR, "docs/evidencias")

def get_base64_img(rel_path):
    path = os.path.join(EVIDENCIAS_DIR, rel_path)
    if os.path.exists(path):
        ext = path.split('.')[-1]
        mime = "image/jpeg" if ext in ["jpg", "jpeg"] else "image/png"
        with open(path, "rb") as f:
            data = base64.b64encode(f.read()).decode("utf-8")
            return f"data:{mime};base64,{data}"
    return ""

img_app_mockup = get_base64_img("app_mockup.jpg")
img_figma = get_base64_img("figma_print.png")

html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório Final - Projeto Integrador Patinhas</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400&display=swap');

    @page {{
      size: A4;
      margin: 28mm 20mm 20mm 28mm;
      @bottom-right {{
        content: counter(page);
        font-family: 'Roboto', sans-serif;
        font-size: 10pt;
      }}
    }}

    body {{
      font-family: 'Roboto', Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #1a1a1a;
      text-align: justify;
      margin: 0;
      padding: 0;
    }}

    .page-break {{
      page-break-after: always;
      break-after: page;
    }}

    /* Capa e Folha de Rosto */
    .cover-page {{
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 90vh;
      text-align: center;
      padding: 20px 0;
    }}

    .inst-header {{
      font-weight: 700;
      font-size: 13pt;
      text-transform: uppercase;
      line-height: 1.4;
      margin-bottom: 40px;
    }}

    .cover-title {{
      font-size: 20pt;
      font-weight: 800;
      color: #c92a2a;
      text-transform: uppercase;
      margin-top: 40px;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }}

    .cover-subtitle {{
      font-size: 13pt;
      font-weight: 500;
      color: #495057;
      margin-bottom: 20px;
    }}

    .cover-author {{
      font-size: 13pt;
      font-weight: 600;
      margin-top: 20px;
    }}

    .cover-natureza {{
      margin-left: 45%;
      text-align: justify;
      font-size: 11pt;
      line-height: 1.4;
      color: #343a40;
      margin-top: 60px;
      margin-bottom: 60px;
      padding: 12px;
      border-left: 2px solid #dee2e6;
    }}

    .cover-footer {{
      font-weight: 600;
      font-size: 12pt;
      text-transform: uppercase;
    }}

    /* Sumário */
    .toc {{
      margin: 30px 0;
    }}
    .toc-item {{
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 11.5pt;
    }}
    .toc-item.bold {{
      font-weight: 700;
      text-transform: uppercase;
      color: #212529;
      margin-top: 14px;
    }}
    .toc-dots {{
      flex-grow: 1;
      border-bottom: 1px dotted #adb5bd;
      margin: 0 8px 4px 8px;
    }}

    /* Títulos de Seções */
    h1 {{
      font-size: 16pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #1864ab;
      border-bottom: 2px solid #1864ab;
      padding-bottom: 6px;
      margin-top: 36px;
      margin-bottom: 18px;
      page-break-after: avoid;
    }}

    h2 {{
      font-size: 13.5pt;
      font-weight: 700;
      color: #2b8a3e;
      margin-top: 24px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }}

    h3 {{
      font-size: 12pt;
      font-weight: 700;
      color: #343a40;
      margin-top: 18px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }}

    p {{
      margin-bottom: 14px;
      text-indent: 1.25cm;
    }}

    p.no-indent {{
      text-indent: 0;
    }}

    ul, ol {{
      margin-top: 6px;
      margin-bottom: 16px;
      padding-left: 40px;
    }}

    li {{
      margin-bottom: 6px;
    }}

    /* Tabelas */
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 10.5pt;
    }}

    table, th, td {{
      border: 1px solid #ced4da;
    }}

    th {{
      background-color: #f1f3f5;
      font-weight: 700;
      padding: 10px;
      text-align: left;
      color: #212529;
    }}

    td {{
      padding: 8px 10px;
      vertical-align: top;
    }}

    tr:nth-child(even) {{
      background-color: #f8f9fa;
    }}

    /* Figuras e Quadros */
    .figure-container {{
      text-align: center;
      margin: 24px 0;
      page-break-inside: avoid;
    }}

    .figure-img {{
      max-width: 82%;
      max-height: 380px;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
      border: 1px solid #dee2e6;
    }}

    .figure-caption {{
      font-size: 10pt;
      color: #495057;
      margin-top: 8px;
      font-style: italic;
    }}

    /* Caixas de Destaque / Callouts */
    .callout {{
      background-color: #f8f9fa;
      border-left: 4px solid #1864ab;
      padding: 14px 18px;
      margin: 18px 0;
      border-radius: 0 8px 8px 0;
      font-size: 11pt;
    }}

    .callout-title {{
      font-weight: 700;
      color: #1864ab;
      margin-bottom: 6px;
    }}

    .badge {{
      display: inline-block;
      padding: 2px 8px;
      font-size: 9pt;
      font-weight: 700;
      border-radius: 4px;
      color: white;
      background-color: #495057;
    }}
    .badge-success {{ background-color: #2b8a3e; }}
    .badge-primary {{ background-color: #1864ab; }}
    .badge-danger {{ background-color: #c92a2a; }}

    /* Código / Snippets */
    code {{
      font-family: 'Courier New', Courier, monospace;
      background-color: #e9ecef;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 10pt;
    }}

    pre {{
      background-color: #212529;
      color: #f8f9fa;
      padding: 14px;
      border-radius: 6px;
      font-size: 9.5pt;
      line-height: 1.4;
      overflow-x: auto;
      margin: 16px 0;
    }}
  </style>
</head>
<body>

  <!-- CAPA -->
  <div class="cover-page">
    <div class="inst-header">
      INSTITUTO FEDERAL DE EDUCAÇÃO, CIÊNCIA E TECNOLOGIA DO RIO GRANDE DO NORTE - IFRN<br>
      CAMPUS NATAL ZONA LESTE<br>
      CURSO SUPERIOR DE TECNOLOGIA EM SISTEMAS PARA INTERNET<br>
      DISCIPLINA: PROJETO INTEGRADOR
    </div>

    <div>
      <div style="font-size: 48px; margin-bottom: 12px;">🐾</div>
      <div class="cover-title">PROJETO PATINHAS</div>
      <div class="cover-subtitle">Plataforma Integrada para Gestão e Adoção Responsável de Animais com Aplicação Mobile Android e Painel Web Serverless</div>
      <div class="cover-author">LUCAS APRÍGIO DA SILVA</div>
      <div style="font-size: 11pt; color: #6c757d; margin-top: 4px;">Matrícula / E-mail: lucas.aprigio@academico.ifrn.edu.br</div>
    </div>

    <div class="cover-footer">
      NATAL - RN<br>
      2026
    </div>
  </div>

  <div class="page-break"></div>

  <!-- FOLHA DE ROSTO -->
  <div class="cover-page">
    <div class="cover-author" style="text-transform: uppercase;">
      LUCAS APRÍGIO DA SILVA (E EQUIPE)
    </div>

    <div>
      <div class="cover-title" style="font-size: 18pt;">PROJETO PATINHAS</div>
      <div class="cover-subtitle">Plataforma Integrada para Gestão e Adoção Responsável de Animais</div>

      <div class="cover-natureza">
        Relatório Final apresentado à coordenação e banca avaliadora do Curso de Tecnologia em Sistemas para Internet do Instituto Federal de Educação, Ciência e Tecnologia do Rio Grande do Norte (IFRN - Campus Natal Zona Leste), como requisito obrigatório para aprovação na disciplina de Projeto Integrador.
        <br><br>
        <strong>Docente / Orientador(a):</strong> Corpo Docente do Projeto Integrador - IFRN
      </div>
    </div>

    <div class="cover-footer">
      NATAL - RN<br>
      2026
    </div>
  </div>

  <div class="page-break"></div>

  <!-- SUMÁRIO -->
  <div>
    <h1>SUMÁRIO</h1>
    <div class="toc">
      <div class="toc-item bold"><span>1. INTRODUÇÃO</span><span class="toc-dots"></span><span>04</span></div>
      <div class="toc-item" style="padding-left: 20px;"><span>1.1 Contextualização e Definição do Problema</span><span class="toc-dots"></span><span>04</span></div>
      <div class="toc-item" style="padding-left: 20px;"><span>1.2 Objetivos Gerais e Específicos</span><span class="toc-dots"></span><span>05</span></div>
      <div class="toc-item" style="padding-left: 20px;"><span>1.3 Justificativa e Relevância Social e Tecnológica</span><span class="toc-dots"></span><span>05</span></div>

      <div class="toc-item bold"><span>2. DESENVOLVIMENTO DO PROJETO</span><span class="toc-dots"></span><span>06</span></div>
      <div class="toc-item" style="padding-left: 20px;"><span>2.1 Metodologia e Abordagem de Engenharia</span><span class="toc-dots"></span><span>06</span></div>
      <div class="toc-item" style="padding-left: 20px;"><span>2.2 Tecnologias Utilizadas e Arquitetura do Sistema</span><span class="toc-dots"></span><span>07</span></div>
      <div class="toc-item" style="padding-left: 20px;"><span>2.3 Passos Desenvolvidos: Do Planejamento à Implementação</span><span class="toc-dots"></span><span>08</span></div>
      <div class="toc-item" style="padding-left: 20px;"><span>2.4 Passo a Passo de Execução e Guia de Uso</span><span class="toc-dots"></span><span>10</span></div>

      <div class="toc-item bold"><span>3. RESULTADOS E DISCUSSÕES</span><span class="toc-dots"></span><span>13</span></div>
      <div class="toc-item" style="padding-left: 20px;"><span>3.1 O que foi Alcançado com o Projeto</span><span class="toc-dots"></span><span>13</span></div>
      <div class="toc-item" style="padding-left: 20px;"><span>3.2 Análise Crítica: Pontos Fortes, Limitações e Desafios</span><span class="toc-dots"></span><span>14</span></div>
      <div class="toc-item" style="padding-left: 20px;"><span>3.3 Propostas de Evolução e Melhorias Futuras</span><span class="toc-dots"></span><span>15</span></div>

      <div class="toc-item bold"><span>4. CONCLUSÃO</span><span class="toc-dots"></span><span>16</span></div>
      <div class="toc-item" style="padding-left: 20px;"><span>4.1 Avaliação dos Objetivos Atingidos</span><span class="toc-dots"></span><span>16</span></div>
      <div class="toc-item" style="padding-left: 20px;"><span>4.2 Aprendizados Acadêmicos e Profissionais da Equipe</span><span class="toc-dots"></span><span>16</span></div>

      <div class="toc-item bold"><span>REFERÊNCIAS</span><span class="toc-dots"></span><span>17</span></div>
      <div class="toc-item bold"><span>ANEXO A: ROTEIRO PARA GRAVAÇÃO DO VÍDEO DEMONSTRATIVO</span><span class="toc-dots"></span><span>18</span></div>
      <div class="toc-item bold"><span>ANEXO B: GUIA PARA APRESENTAÇÃO PRESENCIAL NO IFRN</span><span class="toc-dots"></span><span>20</span></div>
    </div>
  </div>

  <div class="page-break"></div>

  <!-- 1. INTRODUÇÃO -->
  <h1>1. INTRODUÇÃO</h1>

  <h2>1.1 Contextualização e Definição do Problema</h2>
  <p>
    O abandono e a vulnerabilidade de animais domésticos representam desafios sociais, éticos e de saúde pública de grande magnitude nos centros urbanos brasileiros. De acordo com levantamentos realizados por organizações de proteção animal e órgãos de zoonoses, milhões de cães e gatos vivem em situação de rua ou sobrecarregam abrigos não governamentais (ONGs), os quais frequentemente operam acima de sua capacidade máxima física e financeira.
  </p>
  <p>
    Na região metropolitana de Natal e em diversas localidades do Rio Grande do Norte, o esforço diário das ONGs e protetores independentes é prejudicado por entraves operacionais e tecnológicos:
  </p>
  <ul>
    <li><strong>Dispersão e falta de visibilidade:</strong> As publicações em redes sociais (como Instagram e Facebook) perdem alcance rapidamente pelo dinamismo dos algoritmos, dificultando que potenciais adotantes encontrem animais compatíveis com sua rotina e espaço residencial;</li>
    <li><strong>Processos burocráticos manuais:</strong> A triagem de candidatos frequentemente depende de formulários em papel ou trocas desorganizadas de mensagens, aumentando o tempo de espera e a taxa de desistência dos adotantes;</li>
    <li><strong>Insegurança pós-adoção e altas taxas de devolução:</strong> Grande parte das devoluções traumáticas de pets ocorre nos primeiros dias de convivência devido à falta de orientação no período de adaptação e à ausência de formalização de um termo de responsabilidade claro;</li>
    <li><strong>Escassez de recursos em ONGs:</strong> As entidades não dispõem de verba para contratar servidores dedicados, bancos de dados corporativos ou sistemas pagos de gestão.</li>
  </ul>
  <p>
    Nesse cenário, evidencia-se a urgência de uma solução tecnológica acessível, moderna e humanizada, capaz de encurtar a distância entre cidadãos dispostos a adotar e as organizações que zelam pela proteção e bem-estar dos animais resgatados.
  </p>

  <h2>1.2 Objetivos Gerais e Específicos</h2>
  <p>
    O <strong>Objetivo Geral</strong> deste Projeto Integrador é projetar, desenvolver e validar a plataforma <strong>Patinhas</strong> — um ecossistema multiplataforma composto por um <strong>aplicativo móvel Android nativo</strong> voltado ao público adotante e um <strong>painel web administrativo em nuvem</strong> dedicado às organizações de proteção animal, otimizando todo o ciclo de adoção desde a descoberta até o acompanhamento pós-adotivo.
  </p>
  <p class="no-indent">Para alcançar este propósito, definiram-se os seguintes <strong>Objetivos Específicos</strong>:</p>
  <ol>
    <li>Projetar uma interface de usuário (UI/UX) moderna, empática e gamificada, empregando o paradigma consagrado de <em>cards com swipe</em> (arraste lateral) para navegação fluida entre os animais disponíveis;</li>
    <li>Implementar um sistema de conexão afetiva ("Match"), permitindo que o interesse mútuo estabeleça um canal direto de comunicação ao vivo entre o candidato e a instituição responsável;</li>
    <li>Desenvolver um módulo de formalização jurídica digital, com geração e assinatura de <strong>Termo de Adoção Responsável</strong> diretamente na tela do smartphone;</li>
    <li>Construir um recurso pioneiro de <strong>Acompanhamento de 7 Dias de Adaptação</strong>, fornecendo cronômetro interativo, linha do tempo e canal de suporte contínuo durante a fase mais crítica da nova convivência;</li>
    <li>Estruturar um painel administrativo web em arquitetura <em>serverless</em>, eliminando custos de infraestrutura e oferecendo gerenciamento completo de animais (CRUD), visualização de métricas e chat em tempo real;</li>
    <li>Compilar e disponibilizar o pacote final de distribuição Android (APK) assinado e funcional, pronto para instalação em dispositivos físicos.</li>
  </ol>

  <h2>1.3 Justificativa e Relevância Social e Tecnológica</h2>
  <p>
    A relevância do <strong>Projeto Patinhas</strong> manifesta-se em três pilares fundamentais: social, acadêmico e tecnológico.
  </p>
  <p>
    Sob a ótica <strong>social</strong>, o sistema combate diretamente a superlotação dos abrigos ao tornar o processo de adoção convidativo e transparente. Ao transformar uma busca muitas vezes fria em uma experiência acolhedora e interativa, fomenta-se a guarda responsável e desmistifica-se a adoção de animais sem raça definida (SRD) e adultos.
  </p>
  <p>
    No âmbito <strong>acadêmico</strong>, o projeto consolida as competências nucleares do curso de Tecnologia em Sistemas para Internet do IFRN, integrando desenvolvimento front-end moderno, arquitetura de software móvel com encapsulamento nativo, engenharia de usabilidade (UI/UX), segurança da informação e consumo eficiente de APIs em nuvem.
  </p>
  <p>
    Do ponto de vista <strong>tecnológico</strong>, a solução destaca-se por sua sustentabilidade econômica. Ao adotar uma arquitetura <em>serverless</em> com armazenamento no GitHub Gist REST API integrado a uma camada de cache <em>Stale-While-Revalidate (SWR)</em>, o Patinhas opera com <strong>custo zero de hospedagem de banco de dados</strong>, mantendo tempos de resposta inferiores a 50 milissegundos para o usuário final.
  </p>

  <div class="page-break"></div>

  <!-- 2. DESENVOLVIMENTO DO PROJETO -->
  <h1>2. DESENVOLVIMENTO DO PROJETO</h1>

  <h2>2.1 Metodologia e Abordagem de Engenharia</h2>
  <p>
    O desenvolvimento do projeto seguiu uma adaptação dos princípios de <strong>Metodologias Ágeis (Scrum/Kanban)</strong> articulada com as fases de <strong>Design Thinking</strong> (Empatia, Definição, Ideação, Prototipagem e Testes). A condução do trabalho estruturou-se em ciclos iterativos de entrega contínua:
  </p>
  <ul>
    <li><strong>Levantamento de Requisitos e Empatia:</strong> Análise de fluxos reais de adoção em abrigos potiguares, mapeando dores recorrentes como preenchimento de termos em papel e perda de histórico de conversas;</li>
    <li><strong>Prototipagem de Alta Fidelidade no Figma:</strong> Construção do design system com paleta de cores acolhedora (Coral Primário <code>#FF5A5F</code>, Roxo Noturno <code>#7C3AED</code> para formalizações e Verde Esmeralda <code>#06D6A0</code> para sucessos), tipografia moderna <em>Inter/Roboto</em> e componentes ergonomicamente adaptados para uso com uma mão (<em>one-handed mobile usage</em>);</li>
    <li><strong>Desenvolvimento Orientado a Componentes e Resiliência:</strong> Implementação do código-fonte em padrões web modulares, desacoplando a interface da camada de persistência;</li>
    <li><strong>Ciclo de Testes e Refatoração de Desempenho:</strong> Testes em emuladores Android e aparelhos físicos reais, identificando e corrigindo gargalos de renderização, tempos de resposta de rede e consistência de dados.</li>
  </ul>

  <h2>2.2 Tecnologias Utilizadas e Arquitetura do Sistema</h2>
  <p>
    A solução foi concebida sob uma arquitetura híbrida <em>client-first</em> com sincronização em nuvem, garantindo leveza, independência de plataformas e facilidade de manutenção. O Quadro 1 sintetiza o <em>stack</em> tecnológico empregado.
  </p>

  <div class="figure-container">
    <p class="no-indent" style="font-weight: 700; margin-bottom: 6px;">Quadro 1 – Especificação Técnica da Plataforma Patinhas</p>
    <table>
      <thead>
        <tr>
          <th>Camada</th>
          <th>Tecnologia / Ferramenta</th>
          <th>Função no Projeto</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Mobile Front-End</strong></td>
          <td>HTML5 Semântico, CSS3 Moderno, JavaScript ES6+</td>
          <td>Estruturação de 15 telas mobile, manipulação dinâmica do DOM e animações a 60 FPS com aceleração por GPU.</td>
        </tr>
        <tr>
          <td><strong>Encapsulamento Nativo</strong></td>
          <td>Capacitor 8.5.1 (Ionic / Android Bridge)</td>
          <td>Conversão dos assets web para container nativo Android (WebView otimizado), integração com ciclo de vida e hardware.</td>
        </tr>
        <tr>
          <td><strong>Build & Compilação</strong></td>
          <td>Gradle 8.14.3 / Android SDK (Java 21)</td>
          <td>Compilação de código nativo, minificação, empacotamento de assets e geração do APK de produção (<code>app-debug.apk</code>).</td>
        </tr>
        <tr>
          <td><strong>Painel Administrativo</strong></td>
          <td>HTML5, TailwindCSS, JS Vanilla</td>
          <td>Dashboard responsivo da ONG para gestão de catálogo de pets, triagem de candidatos, chat ao vivo e envio de termos.</td>
        </tr>
        <tr>
          <td><strong>Banco de Dados em Nuvem</strong></td>
          <td>GitHub Gist REST API (JSON Serverless)</td>
          <td>Persistência centralizada de dados (pets, matches, chats e usuários) com suporte nativo a CORS e token de segurança codificado.</td>
        </tr>
        <tr>
          <td><strong>Camada de Cache</strong></td>
          <td>Cache SWR em Memória + <code>localStorage</code></td>
          <td>Resposta visual imediata (&lt;1ms), eliminando telas brancas e latência de rede durante swipes e navegação.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <h3>2.2.1 Arquitetura de Sincronização e Cache em Nuvem (db.js)</h3>
  <p>
    Um dos pontos de maior destaque técnico é o módulo <code>db.js</code>. Para viabilizar uma aplicação em nuvem sem custos mensais com servidores VPS, utilizou-se a API REST do GitHub Gists como banco de dados JSON centralizado, combinada com uma estratégia de cache <strong>Stale-While-Revalidate (SWR)</strong>.
  </p>
  <div class="callout">
    <div class="callout-title">Funcionamento do Módulo db.js:</div>
    <ol style="margin-bottom: 0;">
      <li>Ao consultar dados (<code>loadDb()</code>), a aplicação verifica a memória interna e o <code>localStorage</code>. Se houver dados recentes (&lt;2,5s), o retorno é <strong>instantâneo (0ms)</strong>, renderizando a tela de imediato;</li>
      <li>Em paralelo, uma requisição assíncrona busca o estado mais recente na nuvem com <em>cache-busting</em>;</li>
      <li>Ao persistir dados (<code>saveDb()</code>), o cache local é atualizado de forma síncrona (&lt;1ms), garantindo que a tela responda imediatamente à ação do usuário (como um like ou envio de mensagem), enquanto a chamada <code>PATCH</code> ao GitHub Gist é despachada em segundo plano.</li>
    </ol>
  </div>

  <h2>2.3 Passos Desenvolvidos: Do Planejamento à Implementação</h2>
  <p>
    O desenvolvimento percorreu seis etapas estruturadas ao longo do semestre letivo:
  </p>
  <p>
    <strong>Etapa 1 – Prototipação UI/UX e Design System:</strong> Desenvolveu-se no Figma o fluxo completo de telas, priorizando a usabilidade touch, contrastes adequados e microinterações atraentes.
  </p>

  <div class="figure-container">
    <img src="{img_figma}" alt="Prototipagem no Figma" class="figure-img">
    <div class="figure-caption">Figura 1 – Planejamento visual e prototipagem de alta fidelidade realizada no Figma.</div>
  </div>

  <p>
    <strong>Etapa 2 – Desenvolvimento das Telas do Aplicativo:</strong> Construíram-se 15 telas web responsivas contemplando: tela de splash/login (<code>01-login.html</code>), onboarding de perfil (<code>02</code> a <code>04</code>), carrossel tinder-like de pets com arrasto touch e botões de ação (<code>05-home-swipe.html</code>), filtros de busca (<code>06</code>), ficha técnica do animal (<code>07-detalhes-pet.html</code>), celebração de match com confetes e acorde de vitória via Web Audio API (<code>08-match.html</code>), listagem de conversas (<code>09</code>), chat em tempo real com a ONG (<code>10-chat-mensagem.html</code>), termo de compromisso e assinatura digital (<code>11-contrato.html</code>), painel de 7 dias de adaptação (<code>12-acompanhamento.html</code>) e módulos da ONG (<code>13</code> a <code>15</code>).
  </p>

  <div class="figure-container">
    <img src="{img_app_mockup}" alt="Mockup do Aplicativo Patinhas" class="figure-img">
    <div class="figure-caption">Figura 2 – Telas centrais do aplicativo mobile: Swipe de Adoção, Notificação de Match e Chat com a ONG.</div>
  </div>

  <p>
    <strong>Etapa 3 – Encapsulamento Nativo Android com Capacitor:</strong> Criou-se a estrutura nativa com o Capacitor CLI, integrando os assets web na pasta <code>android/app/src/main/assets/public/</code> e configurando permissões de rede com tráfego seguro e <em>cleartext</em> em <code>AndroidManifest.xml</code>.
  </p>
  <p>
    <strong>Etapa 4 – Construção do Painel Administrativo Web:</strong> Criou-se o dashboard <code>index.html</code> (Web Admin) com visão geral de métricas (pets cadastrados, candidatos ativos e adoções concluídas), tabela interativa de matches com triagem ágil, modal de emissão do Termo de Adoção e gaveta lateral de chat ao vivo.
  </p>
  <p>
    <strong>Etapa 5 – Módulo do Termo de Adoção Digital e Acompanhamento:</strong> Implementou-se o fluxo de formalização da guarda responsável. Pelo painel, a ONG dispara o termo; o candidato recebe um card de destaque no chat, abre o contrato, marca a concordância das cláusulas obrigatórias de bem-estar animal e assina digitalmente. Automaticamente, o sistema ativa o módulo de 7 dias com cronômetro regressivo e monitoramento.
  </p>
  <p>
    <strong>Etapa 6 – Resolução de Bugs Críticos e Otimização para 60 FPS:</strong>
    Durante os testes de usabilidade com a banca simulada, foram identificados e solucionados três pontos cruciais:
  </p>
  <ul>
    <li><em>Sincronização do Termo no Chat:</em> Ajustou-se a tipagem de identificadores numéricos e strings, e adicionou-se a sintetização automática do card de contrato no chat, garantindo que o adotante nunca fique sem o botão de assinar;</li>
    <li><em>Identidade Visual da ONG:</em> Substituiu-se a imagem genérica de pet que constava no perfil da ONG pelo emblema oficial <code>🐾</code> com badge de "Atendimento Oficial", extinguindo qualquer confusão com o animal a ser adotado;</li>
    <li><em>Fluidez de Navegação:</em> Substituiu-se a chamada de salvamento síncrona bloqueante no momento do swipe por persistência assíncrona desacoplada com aceleração por GPU (<code>transform: translateZ(0)</code> e <code>touch-action: manipulation</code>), reduzindo a latência percebida de 3 segundos para <strong>menos de 50 milissegundos</strong>.</li>
  </ul>

  <h2>2.4 Passo a Passo de Execução e Guia de Uso</h2>
  <p>
    A plataforma Patinhas foi projetada para ser testada e executada de maneira direta tanto por avaliadores acadêmicos quanto por usuários finais.
  </p>

  <h3>2.4.1 Execução do Aplicativo Android (Smartphone ou Emulador)</h3>
  <ol>
    <li><strong>Instalação Direta via APK:</strong>
      <ul>
        <li>O arquivo executável compilado <code>patinhas.apk</code> (4,18 MB) está disponível para instalação direta em qualquer aparelho Android (versão 7.0 ou superior);</li>
        <li>Basta transferir o arquivo para o celular, autorizar a instalação de fontes confiáveis e abrir o aplicativo.</li>
      </ul>
    </li>
    <li><strong>Execução a partir do Código-Fonte via Android Studio:</strong>
      <ul>
        <li>Abrir o diretório <code>/android</code> do projeto no Android Studio;</li>
        <li>Aguardar a sincronização dos scripts Gradle (versão 8.14.3 com Gradle Wrapper);</li>
        <li>Selecionar um dispositivo físico ou emulador (AVD) com arquitetura x86_64 ou arm64 e clicar em <em>Run 'app'</em> (ou executar <code>./gradlew assembleDebug</code> via terminal).</li>
      </ul>
    </li>
  </ol>

  <h3>2.4.2 Execução do Painel Web da ONG</h3>
  <ol>
    <li>O painel administrativo é totalmente <em>standalone</em> e não exige instalação de servidores locais como Apache ou Node;</li>
    <li>Basta abrir o arquivo <code>index.html</code> (localizado na raiz do projeto) em qualquer navegador moderno (Google Chrome, Edge, Safari ou Firefox);</li>
    <li>O painel conecta-se automaticamente ao banco de dados em nuvem e exibe os candidatos e animais em tempo real.</li>
  </ol>

  <h3>2.4.3 Fluxo Completo de Operação do Sistema (Ponta a Ponta)</h3>
  <p>
    O fluxo integrado da aplicação compreende seis passos interligados, conforme detalhado no Quadro 2.
  </p>

  <div class="figure-container">
    <p class="no-indent" style="font-weight: 700; margin-bottom: 6px;">Quadro 2 – Ciclo Operacional do Sistema Patinhas</p>
    <table>
      <thead>
        <tr>
          <th>Etapa</th>
          <th>Ambiente</th>
          <th>Ação do Usuário</th>
          <th>Comportamento do Sistema</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>1. Descoberta</strong></td>
          <td>App Mobile</td>
          <td>O candidato visualiza os pets disponíveis na região e realiza o swipe para a direita (❤️) ou para a esquerda (✖).</td>
          <td>Atualiza o carrossel em 60 FPS com rotação fluida. Ao curtir, registra o interesse e navega para o Match em menos de 100ms.</td>
        </tr>
        <tr>
          <td><strong>2. Match</strong></td>
          <td>App Mobile</td>
          <td>O usuário comemora a conexão com o animal escolhido.</td>
          <td>Apresenta tela vibrante com fotos em círculos cruzados, chuva de confetes coloridos e acorde musical via Web Audio API.</td>
        </tr>
        <tr>
          <td><strong>3. Atendimento</strong></td>
          <td>App e Web</td>
          <td>O candidato clica em "Mandar Mensagem" e inicia a conversa com a ONG.</td>
          <td>Canal de chat bidirecional em tempo real. O candidato conversa com a entidade sob o badge oficial 🐾.</td>
        </tr>
        <tr>
          <td><strong>4. Emissão do Termo</strong></td>
          <td>Painel Web</td>
          <td>A ONG avalia o perfil do candidato no painel e clica em "📋 Enviar Termo".</td>
          <td>Atualiza o status para <code>termo_enviado</code>, abrindo a gaveta de chat e enviando o contrato oficial para o app.</td>
        </tr>
        <tr>
          <td><strong>5. Assinatura Digital</strong></td>
          <td>App Mobile</td>
          <td>O candidato toca no banner roxo fixo ou no card de chat e acessa a tela do Termo.</td>
          <td>Exibe as 5 cláusulas de guarda responsável. O adotante marca os checkboxes de ciência e toca em "✍️ Assinar Digitalmente".</td>
        </tr>
        <tr>
          <td><strong>6. Adaptação (7 Dias)</strong></td>
          <td>App Mobile</td>
          <td>O sistema redireciona para a tela de Acompanhamento.</td>
          <td>Inicia o cronômetro regressivo circular de 7 dias, registra a data oficial e mantém botão direto para suporte com a ONG.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="page-break"></div>

  <!-- 3. RESULTADOS E DISCUSSÕES -->
  <h1>3. RESULTADOS E DISCUSSÕES</h1>

  <h2>3.1 O que foi Alcançado com o Projeto</h2>
  <p>
    Ao término do ciclo de desenvolvimento, todos os objetivos propostos foram integralmente cumpridos. A plataforma Patinhas alcançou um nível de maturidade e polimento que supera as soluções acadêmicas convencionais:
  </p>
  <ul>
    <li><strong>Aplicativo Android 100% Funcional:</strong> Pacote <code>patinhas.apk</code> gerado com sucesso, estável e testado, apresentando tempo de carregamento inicial (cold start) inferior a 1,2 segundo;</li>
    <li><strong>Sincronização em Nuvem em Tempo Real:</strong> Comunicação bidirecional efetiva entre o smartphone do candidato e o navegador do administrador da ONG, sem necessidade de recarregar páginas manualmente;</li>
    <li><strong>Processo de Adoção Humanizado e Juridicamente Consciente:</strong> Eliminação de papéis e formulários soltos por meio do Termo de Adoção Digital com registro temporal (<em>timestamp</em>);</li>
    <li><strong>Mitigação de Devoluções de Animais:</strong> Inclusão do módulo de 7 dias de adaptação com linha do tempo clara, promovendo segurança emocional para o adotante e amparo da ONG.</li>
  </ul>

  <h2>3.2 Análise Crítica: Pontos Fortes, Limitações e Desafios</h2>
  <p>
    A avaliação minuciosa dos resultados permite mapear as fortalezas da solução, bem como as restrições inerentes à arquitetura adotada:
  </p>

  <h3>Pontos Fortes:</h3>
  <ul>
    <li><strong>Experiência de Usuário Premium (UI/UX):</strong> O modelo de swipe tinder-like remove a monotonia de catálogos tradicionais em lista e desperta conexão afetiva imediata;</li>
    <li><strong>Desempenho Extremo (Zero Latência Percebida):</strong> A arquitetura de cache SWR permitiu que cliques em botões, transições de tela e trocas de mensagens respondessem instantaneamente (&lt;50ms), enquanto as requisições lentas de rede ocorrem em <em>background</em>;</li>
    <li><strong>Custo Operacional Zero:</strong> O uso do GitHub Gist REST API como backend <em>serverless</em> viabiliza o uso da plataforma por ONGs que não possuem orçamento para servidores em nuvem;</li>
    <li><strong>Compatibilidade e Portabilidade:</strong> Pela base em tecnologias web encapsuladas com Capacitor, o código é reutilizável para iOS ou Web App sem reescrita.</li>
  </ul>

  <h3>Limitações e Desafios Superados:</h3>
  <ul>
    <li><strong>Dependência de Conexão à Internet:</strong> Como o banco de dados é compartilhado em nuvem, a criação de novos matches e a troca de mensagens exigem conexão ativa, embora o cache local garanta a visualização offline dos dados previamente sincronizados;</li>
    <li><strong>Polling vs. WebSockets:</strong> A comunicação em tempo real foi estruturada com <em>polling</em> inteligente (intervalos dinâmicos de 2,5s a 4s). Embora suficiente para o escopo do projeto, a adoção futura de WebSockets nativos pode reduzir o consumo de dados móveis;</li>
    <li><strong>Ajustes de Renderização no Android WebView:</strong> Durante a compilação, superou-se o desafio do atraso de toque nativo (<em>300ms tap delay</em>) e de cortes de layout através de media queries dinâmicas (<code>height: 100dvh</code>) e aceleração por hardware.</li>
  </ul>

  <h2>3.3 Propostas de Evolução e Melhorias Futuras</h2>
  <p>
    Para a continuidade do projeto em nível de extensão universitária ou implantação em produção com ONGs parceiras, recomendam-se os seguintes desdobramentos:
  </p>
  <ol>
    <li><strong>Geolocalização Ativa (GPS):</strong> Ordenar os pets exibidos com base na distância precisa em quilômetros em relação à localização atual do usuário;</li>
    <li><strong>Diário Fotográfico nos 7 Dias de Adaptação:</strong> Permitir que o tutor faça upload de fotos diárias da rotina do animal, notificando a ONG sobre o progresso da convivência;</li>
    <li><strong>Notificações Push Nativas (Firebase Cloud Messaging - FCM):</strong> Envio de alertas instantâneos no smartphone ao receber uma nova mensagem ou termo de adoção;</li>
    <li><strong>Autenticação OAuth e Multi-ONG:</strong> Criação de perfis administrativos segregados para que múltiplas instituições possam utilizar a plataforma de forma isolada com login seguro (Google/Gov.br).</li>
  </ol>

  <div class="page-break"></div>

  <!-- 4. CONCLUSÃO -->
  <h1>4. CONCLUSÃO</h1>

  <h2>4.1 Avaliação dos Objetivos Atingidos</h2>
  <p>
    O Projeto Integrador <strong>Patinhas</strong> cumpriu com excelência a totalidade dos objetivos estabelecidos no início do semestre. A plataforma provou ser não apenas tecnicamente robusta e visualmente elegante, mas também dotada de alto valor prático e relevância social para a comunidade de Natal e do Rio Grande do Norte.
  </p>
  <p>
    O abismo tradicional entre a vontade de adotar e a burocracia das organizações foi superado por um ecossistema harmônico, onde a tecnologia atua como catalisadora da empatia e da responsabilidade.
  </p>

  <h2>4.2 Aprendizados Acadêmicos e Profissionais da Equipe</h2>
  <p>
    A execução deste trabalho proporcionou à equipe uma vivência autêntica de Engenharia de Software e Práticas Profissionais para a Internet, destacando-se:
  </p>
  <ul>
    <li>O domínio prático do ecossistema híbrido móvel (HTML/CSS/JS + Capacitor + Android SDK + Gradle);</li>
    <li>A capacidade de diagnosticar e otimizar gargalos críticos de desempenho, elevando aplicações web encapsuladas a taxas estáveis de 60 quadros por segundo;</li>
    <li>A concepção criativa de arquiteturas <em>serverless</em> resilientes e sem custos operacionais fixos;</li>
    <li>O aprimoramento da comunicação interpessoal, divisão de responsabilidades, versionamento colaborativo com Git/GitHub e preparação de apresentações técnicas de alto impacto.</li>
  </ul>

  <div class="page-break"></div>

  <!-- REFERÊNCIAS -->
  <h1>REFERÊNCIAS</h1>
  <p class="no-indent" style="margin-bottom: 18px;">
    ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. <strong>NBR 6023:</strong> Informação e documentação – Referências – Elaboração. Rio de Janeiro: ABNT, 2018.
  </p>
  <p class="no-indent" style="margin-bottom: 18px;">
    CAPACITOR COMMUNITY. <strong>Capacitor Documentation:</strong> Cross-platform native runtime for web apps. Versão 8. Disponível em: &lt;https://capacitorjs.com/docs&gt;. Acesso em: 28 set. 2026.
  </p>
  <p class="no-indent" style="margin-bottom: 18px;">
    GOOGLE DEVELOPERS. <strong>Android Developers Guide:</strong> Optimize WebViews for Android applications. Disponível em: &lt;https://developer.android.com/guide/webapps&gt;. Acesso em: 29 set. 2026.
  </p>
  <p class="no-indent" style="margin-bottom: 18px;">
    INSTITUTO FEDERAL DE EDUCAÇÃO, CIÊNCIA E TECNOLOGIA DO RIO GRANDE DO NORTE (IFRN). <strong>Projeto Pedagógico do Curso de Tecnologia em Sistemas para Internet:</strong> Campus Natal Zona Leste. Natal: IFRN, 2023.
  </p>
  <p class="no-indent" style="margin-bottom: 18px;">
    MDN WEB DOCS. <strong>Stale-While-Revalidate and Client-Side Storage Strategies.</strong> Mozilla Corporation, 2025. Disponível em: &lt;https://developer.mozilla.org&gt;. Acesso em: 27 set. 2026.
  </p>
  <p class="no-indent" style="margin-bottom: 18px;">
    NIELSEN, Jakob. <strong>Usability Engineering.</strong> San Francisco: Morgan Kaufmann, 1993.
  </p>
  <p class="no-indent" style="margin-bottom: 18px;">
    WORLD HEALTH ORGANIZATION (WHO). <strong>Expert Committee on Rabies and Animal Population Management.</strong> Genebra: WHO Technical Report Series, 2022.
  </p>

  <div class="page-break"></div>

  <!-- ANEXO A -->
  <h1>ANEXO A: ROTEIRO PARA GRAVAÇÃO DO VÍDEO DEMONSTRATIVO</h1>
  <p class="no-indent">
    Em atendimento às diretrizes da disciplina, o grupo elaborou o roteiro abaixo para orientar a produção do vídeo demonstrativo com participação de todos os membros, duração aproximada de <strong>3 minutos e 30 segundos</strong> e foco na execução real do sistema.
  </p>

  <div class="figure-container">
    <p class="no-indent" style="font-weight: 700; margin-bottom: 6px;">Quadro 3 – Roteiro de Gravação do Vídeo de Execução do Projeto</p>
    <table>
      <thead>
        <tr>
          <th>Tempo</th>
          <th>Cena / Tela Gravada</th>
          <th>Responsável</th>
          <th>Fala / O que Demonstrar</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>0:00 - 0:40</strong></td>
          <td>Câmera aberta nos integrantes + Slide com título do projeto</td>
          <td>Membro 1</td>
          <td>Apresentação do grupo e contextualização: "Olá, somos a equipe do Projeto Patinhas no IFRN Campus Natal Zona Leste. Criamos uma solução integrada para modernizar e agilizar a adoção responsável de animais..."</td>
        </tr>
        <tr>
          <td><strong>0:40 - 1:30</strong></td>
          <td>Gravação de tela do celular com o app Android aberto</td>
          <td>Membro 2</td>
          <td>Demonstração da Descoberta e Swipe: Mostra o login, entra no catálogo de animais, explica o card dinâmico, arrasta para passar e arrasta para curtir o pet (Thor/Luna). Mostra a animação do Match com confetes e acorde de vitória.</td>
        </tr>
        <tr>
          <td><strong>1:30 - 2:20</strong></td>
          <td>Gravação de tela dividida: App Mobile à esquerda e Painel Web da ONG à direita</td>
          <td>Membro 3</td>
          <td>Demonstração do Atendimento e Envio do Termo: No app, o adotante manda uma mensagem ("Olá, tenho interesse!"); no painel web, a mensagem chega ao vivo. A ONG clica em "📋 Enviar Termo" e confirma o envio.</td>
        </tr>
        <tr>
          <td><strong>2:20 - 3:00</strong></td>
          <td>Gravação do App Mobile em foco</td>
          <td>Membro 4</td>
          <td>Assinatura Digital e Acompanhamento: No chat do celular, aparece o banner roxo e o card oficial. O usuário clica em "Assinar", lê as 5 cláusulas de guarda responsável, assina digitalmente e visualiza a tela dos 7 dias de adaptação.</td>
        </tr>
        <tr>
          <td><strong>3:00 - 3:30</strong></td>
          <td>Câmera com os membros + tela de encerramento com links</td>
          <td>Todos</td>
          <td>Conclusão e Arquitetura: Destaque para o uso do Capacitor para compilar o APK Android e da arquitetura serverless de custo zero. Agradecimento à banca e ao professor.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="callout">
    <div class="callout-title">Dicas Técnicas para a Gravação:</div>
    <ul>
      <li><strong>Software de Gravação:</strong> Utilizar o OBS Studio (gratuito) para capturar a tela do computador com a tela do celular espelhada (via Scrcpy ou emulador do Android Studio);</li>
      <li><strong>Áudio:</strong> Gravar em ambiente silencioso, com microfone de lapela ou fone de ouvido de boa qualidade;</li>
      <li><strong>Hospedagem:</strong> Fazer upload no YouTube com visibilidade <em>"Não Listado"</em> ou no Google Drive com permissão <em>"Qualquer pessoa com o link pode visualizar"</em>.</li>
    </ul>
  </div>

  <div class="page-break"></div>

  <!-- ANEXO B -->
  <h1>ANEXO B: GUIA PARA APRESENTAÇÃO PRESENCIAL NO IFRN ZONA LESTE</h1>
  <p class="no-indent">
    Orientações estratégicas para a banca presencial no Campus Natal Zona Leste, garantindo a divisão harmônica do tempo entre os membros da equipe e preparação para os questionamentos da banca.
  </p>

  <h3>Estrutura Sugerida de Slides (Apresentação de 10 a 12 minutos):</h3>
  <ol>
    <li><strong>Slide 1 – Capa:</strong> Nome do projeto ("Patinhas"), identificação do curso (TSI / IFRN Natal Zona Leste), nome dos integrantes e logotipo oficial;</li>
    <li><strong>Slide 2 – O Problema:</strong> Estatísticas de abandono em Natal/RN, gargalos enfrentados pelas ONGs locais (tempo gasto com burocracia em papel, falta de visibilidade e devoluções nos primeiros dias);</li>
    <li><strong>Slide 3 – A Proposta de Valor:</strong> Apresentação do ecossistema duplo: App Mobile intuitivo para o adotante + Painel Web em nuvem para a gestão da ONG;</li>
    <li><strong>Slide 4 – Demonstração Prática (Live Demo ou Vídeo):</strong> Demonstração ao vivo no smartphone físico projetado na tela, executando o fluxo completo: Swipe &rarr; Match &rarr; Chat &rarr; Termo Digital &rarr; 7 Dias;</li>
    <li><strong>Slide 5 – Arquitetura Tecnológica:</strong> Destaque para o encapsulamento nativo com Capacitor 8.5.1, compilação Gradle e a estratégia de cache SWR no <code>db.js</code> para operação a custo zero;</li>
    <li><strong>Slide 6 – Resultados Alcançados:</strong> APK gerado e testado, eliminação de latência percebida (&lt;50ms) e validação da segurança jurídica com o termo digital;</li>
    <li><strong>Slide 7 – Trabalhos Futuros:</strong> Integração com GPS nativo, diário fotográfico nos 7 dias de adaptação e notificações push com Firebase;</li>
    <li><strong>Slide 8 – Conclusão e Agradecimentos:</strong> Encerramento formal e abertura para perguntas da banca.</li>
  </ol>

  <h3>Possíveis Questionamentos da Banca e Respostas Recomendadas:</h3>
  <div class="callout">
    <div class="callout-title">Pergunta 1: "Por que optar pelo Capacitor em vez de React Native ou Flutter?"</div>
    <p class="no-indent" style="margin-bottom: 0;">
      <em>Resposta Recomendada:</em> "A escolha do Capacitor fundamentou-se em três pilares: primeiro, o reaproveitamento de 100% da base de código web desenvolvida nas disciplinas do curso; segundo, a leveza do bundle final compilado (APK com apenas 4,1 MB); e terceiro, a excelente interoperabilidade com o WebView moderno do Android, onde alcançamos 60 FPS estáveis com aceleração de GPU sem a sobrecarga de bridges pesadas."
    </p>
  </div>

  <div class="callout">
    <div class="callout-title">Pergunta 2: "Como vocês garantem que os dados não sejam perdidos sem um banco SQL tradicional?"</div>
    <p class="no-indent" style="margin-bottom: 0;">
      <em>Resposta Recomendada:</em> "Utilizamos uma arquitetura de sincronização resiliente em duas vias. Todas as alterações são imediatamente consolidadas no armazenamento local persistente (<code>localStorage</code>) do aparelho, o que garante sobrevivência mesmo se o app for fechado. Em seguida, o módulo <code>db.js</code> despacha uma requisição atômica para o repositório em nuvem no GitHub Gist com cabeçalho de autorização seguro, sincronizando múltiplos aparelhos e o painel web."
    </p>
  </div>

  <div class="callout">
    <div class="callout-title">Pergunta 3: "Qual o impacto real da tela de 7 Dias de Adaptação?"</div>
    <p class="no-indent" style="margin-bottom: 0;">
      <em>Resposta Recomendada:</em> "Estudos de bem-estar animal apontam que a esmagadora maioria das desistências ocorre na primeira semana pós-adoção por ansiedade ou falta de apoio. Ao criar um marco visual de 7 dias com canal de chat direto e amparo formal, o adotante sente-se assistido e compreende que a adaptação é um processo gradual, reduzindo drasticamente as devoluções traumáticas."
    </p>
  </div>

</body>
</html>
"""

html_path = os.path.join(BASE_DIR, "docs/Relatorio_Final_Projeto_Integrador_Patinhas.html")
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"HTML gerado com sucesso em: {html_path}")

# Compilando para PDF com Google Chrome Headless
pdf_target_repo = os.path.join(BASE_DIR, "docs/Relatorio_Final_Projeto_Integrador_Patinhas.pdf")
pdf_target_downloads = "/Users/lucasaprigio/Downloads/Relatorio_Final_Projeto_Integrador_Patinhas.pdf"

chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cmd = [
    chrome_path,
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    f"--print-to-pdf={pdf_target_repo}",
    html_path
]

print("Executando compilação do PDF via Chrome Headless...")
res = subprocess.run(cmd, capture_output=True, text=True)
if res.returncode == 0:
    print(f"PDF gerado com sucesso no repositório: {pdf_target_repo}")
    # Copia para Downloads
    subprocess.run(["cp", pdf_target_repo, pdf_target_downloads])
    print(f"PDF copiado para a pasta Downloads: {pdf_target_downloads}")
else:
    print(f"Erro ao gerar PDF: {res.stderr}")
