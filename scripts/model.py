# CRNN model + label utilities (PyTorch)
# - CNN extracts features -> sequence along width
# - BiLSTM decodes sequence -> per-timestep logits
# - CTC loss for training, greedy CTC for inference

from typing import List, Tuple, Dict
import torch
import torch.nn as nn
import torch.nn.functional as F

# Character set: digits + uppercase letters (common CAPTCHAs).
# Customize as needed (e.g., remove confusing I/O).
CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
BLANK = "-"  # CTC blank symbol (not part of CHARS)
IDX2CHAR: Dict[int, str] = {i: c for i, c in enumerate(CHARS)}
CHAR2IDX: Dict[str, int] = {c: i for i, c in enumerate(CHARS)}
NUM_CLASSES = len(CHARS) + 1  # +1 for CTC blank


class CRNN(nn.Module):
    def __init__(self, in_channels=1, num_classes=NUM_CLASSES, lstm_hidden=128):
        super().__init__()
        # CNN stack (kept compact; expand for higher accuracy)
        self.cnn = nn.Sequential(
            nn.Conv2d(in_channels, 32, 3, padding=1), nn.ReLU(True), nn.MaxPool2d(2, 2),
            nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(True), nn.MaxPool2d(2, 2),
            nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(True),
            nn.Conv2d(128, 128, 3, padding=1), nn.ReLU(True), nn.MaxPool2d((2, 1), (2, 1)),
        )
        # Height after pools (input H=32): 32 -> 16 -> 8 -> 4
        self.lstm = nn.LSTM(
            input_size=128 * 4,
            hidden_size=lstm_hidden,
            num_layers=2,
            bidirectional=True,
            batch_first=False,
        )
        self.fc = nn.Linear(lstm_hidden * 2, num_classes)

    def forward(self, x):
        # x: (B, 1, H, W)
        feats = self.cnn(x)  # (B, C, H', W')
        B, C, Hp, Wp = feats.shape
        seq = feats.permute(0, 3, 1, 2).contiguous()  # (B, W', C, H')
        seq = seq.view(B, Wp, C * Hp)                 # (B, W', C*H')
        seq = seq.permute(1, 0, 2)                    # (T=W', B, C*H')
        out, _ = self.lstm(seq)                       # (T, B, 2*hidden)
        logits = self.fc(out)                         # (T, B, num_classes)
        return logits


def greedy_ctc_decode(logits: torch.Tensor) -> Tuple[str, float]:
    """
    Greedy CTC decoding.
    logits: (T, B, num_classes) with B=1 expected
    Returns: (decoded_text, confidence)
      - confidence is the average probability of chosen characters after collapsing repeats and removing blanks.
    """
    probs = F.softmax(logits, dim=-1)                 # (T, B, C)
    best_idx = probs.argmax(dim=-1)                   # (T, B)
    best_prob = probs.max(dim=-1).values              # (T, B)

    best_idx_seq = best_idx[:, 0]                     # (T,)
    best_prob_seq = best_prob[:, 0]                   # (T,)

    decoded_chars: List[str] = []
    char_confidences: List[float] = []

    prev_char = None
    prev_conf: float = 0.0

    for idx, p in zip(best_idx_seq.tolist(), best_prob_seq.tolist()):
        if idx == NUM_CLASSES - 1:  # blank
            if prev_char is not None:
                decoded_chars.append(prev_char)
                char_confidences.append(prev_conf)
            prev_char = None
            prev_conf = 0.0
            continue
        char = IDX2CHAR.get(int(idx), "")
        if prev_char == char:
            prev_conf = max(prev_conf, float(p))  # keep strongest repeat prob
            continue
        else:
            if prev_char is not None:
                decoded_chars.append(prev_char)
                char_confidences.append(prev_conf)
            prev_char = char
            prev_conf = float(p)

    if prev_char is not None:
        decoded_chars.append(prev_char)
        char_confidences.append(prev_conf)

    text = "".join(decoded_chars)
    conf = float(sum(char_confidences) / max(1, len(char_confidences)))
    return text, conf


def load_model(weights_path: str, device: str | torch.device = "cpu") -> CRNN:
    model = CRNN()
    model.load_state_dict(torch.load(weights_path, map_location=device))
    model.eval()
    return model


# Training outline (compact):
#
# - Dataset: (image, label string), preprocess each image to (1, 32, W).
# - Encode labels: map string to indices (CHAR2IDX), concatenate; track target_lengths.
# - Loss: nn.CTCLoss(blank=NUM_CLASSES-1, zero_infinity=True).
# - Optim: Adam (lr=1e-3), cosine decay; use augmentations (elastic, affine, noise).
# - Validation: track CER/WER; early stopping. Export to TorchScript/ONNX for prod.
